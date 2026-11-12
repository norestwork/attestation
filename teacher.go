package main

import (
	"context"
	"errors"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
)

type Document struct {
	ID          int       `json:"id"`
	CriterionID int       `json:"criterion_id"`
	Description string    `json:"description"`
	Filename    string    `json:"filename"`
	Accepted    bool      `json:"accepted"`
	UploadedAt  time.Time `json:"uploaded_at"`
}

type CriterionStatus struct {
	ID       int    `json:"id"`
	Title    string `json:"title"`
	Uploaded int    `json:"uploaded"` // сколько документов загружено
	Accepted bool   `json:"accepted"` // есть хотя бы один принятый
}

type Status struct {
	AttestedAt   *string           `json:"attested_at"`
	EndsAt       *string           `json:"ends_at"`
	Deadline     *string           `json:"deadline"`
	ReadinessPct int               `json:"readiness_pct"`
	Criteria     []CriterionStatus `json:"criteria"`
}

// разрешённые типы файлов: по содержимому, а не по расширению
var allowedTypes = map[string]string{
	"application/pdf": ".pdf",
	"image/jpeg":      ".jpg",
	"image/png":       ".png",
}

func (a *App) listDocs(ctx context.Context, teacherID int) ([]Document, error) {
	rows, err := a.db.Query(ctx, `SELECT id, criterion_id, description, filename, accepted, uploaded_at
		FROM documents WHERE teacher_id = $1 ORDER BY uploaded_at DESC`, teacherID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	docs := make([]Document, 0)
	for rows.Next() {
		var d Document
		if err := rows.Scan(&d.ID, &d.CriterionID, &d.Description, &d.Filename, &d.Accepted, &d.UploadedAt); err != nil {
			return nil, err
		}
		docs = append(docs, d)
	}
	return docs, rows.Err()
}

// GET /api/criteria
func (a *App) handleCriteria(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.Query(r.Context(), `SELECT id, title FROM criteria ORDER BY id`)
	if err != nil {
		serverErr(w, err)
		return
	}
	defer rows.Close()
	type item struct {
		ID    int    `json:"id"`
		Title string `json:"title"`
	}
	list := make([]item, 0)
	for rows.Next() {
		var c item
		if err := rows.Scan(&c.ID, &c.Title); err != nil {
			serverErr(w, err)
			return
		}
		list = append(list, c)
	}
	writeJSON(w, http.StatusOK, list)
}

// GET /api/my/status
func (a *App) handleMyStatus(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r)
	ctx := r.Context()

	var st Status
	err := a.db.QueryRow(ctx, `SELECT attested_at::text,
			(attested_at + interval '5 years')::date::text,
			(attested_at + interval '4 years 6 months')::date::text
		FROM teachers WHERE id = $1`, u.ID).Scan(&st.AttestedAt, &st.EndsAt, &st.Deadline)
	if err != nil {
		serverErr(w, err)
		return
	}

	rows, err := a.db.Query(ctx, `SELECT c.id, c.title, count(d.id), coalesce(bool_or(d.accepted), false)
		FROM criteria c
		LEFT JOIN documents d ON d.criterion_id = c.id AND d.teacher_id = $1
		GROUP BY c.id ORDER BY c.id`, u.ID)
	if err != nil {
		serverErr(w, err)
		return
	}
	defer rows.Close()
	st.Criteria = make([]CriterionStatus, 0)
	accepted := 0
	for rows.Next() {
		var c CriterionStatus
		if err := rows.Scan(&c.ID, &c.Title, &c.Uploaded, &c.Accepted); err != nil {
			serverErr(w, err)
			return
		}
		if c.Accepted {
			accepted++
		}
		st.Criteria = append(st.Criteria, c)
	}
	if n := len(st.Criteria); n > 0 {
		st.ReadinessPct = accepted * 100 / n
	}
	writeJSON(w, http.StatusOK, st)
}

// GET /api/my/documents
func (a *App) handleMyDocuments(w http.ResponseWriter, r *http.Request) {
	docs, err := a.listDocs(r.Context(), userFrom(r).ID)
	if err != nil {
		serverErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, docs)
}

// POST /api/my/documents  (multipart: criterion_id, description, file)
func (a *App) handleUpload(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r)
	ctx := r.Context()

	r.Body = http.MaxBytesReader(w, r.Body, maxUpload+(1<<20))
	if err := r.ParseMultipartForm(maxUpload); err != nil {
		fail(w, http.StatusBadRequest, "файл слишком большой (максимум 10 МБ) или форма неверна")
		return
	}
	criterionID, err := strconv.Atoi(r.FormValue("criterion_id"))
	if err != nil {
		fail(w, http.StatusBadRequest, "не указан критерий")
		return
	}
	var exists bool
	if err := a.db.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM criteria WHERE id = $1)`, criterionID).Scan(&exists); err != nil {
		serverErr(w, err)
		return
	}
	if !exists {
		fail(w, http.StatusBadRequest, "такого критерия нет")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		fail(w, http.StatusBadRequest, "нужен файл в поле file")
		return
	}
	defer file.Close()
	if header.Size > maxUpload {
		fail(w, http.StatusRequestEntityTooLarge, "файл больше 10 МБ")
		return
	}

	// тип определяем по содержимому
	buf := make([]byte, 512)
	n, _ := file.Read(buf)
	ext, ok := allowedTypes[http.DetectContentType(buf[:n])]
	if !ok {
		fail(w, http.StatusBadRequest, "допустимы только PDF, JPG и PNG")
		return
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		serverErr(w, err)
		return
	}

	// имя на диске генерируем сами: uploads/<id преподавателя>/<случайное имя>
	rel := filepath.Join(strconv.Itoa(u.ID), randHex(16)+ext)
	full := filepath.Join(a.uploadDir, rel)
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		serverErr(w, err)
		return
	}
	dst, err := os.Create(full)
	if err != nil {
		serverErr(w, err)
		return
	}
	if _, err := io.Copy(dst, file); err != nil {
		dst.Close()
		os.Remove(full)
		serverErr(w, err)
		return
	}
	dst.Close()

	var id int
	err = a.db.QueryRow(ctx, `INSERT INTO documents (teacher_id, criterion_id, description, filename, path)
		VALUES ($1, $2, $3, $4, $5) RETURNING id`,
		u.ID, criterionID, r.FormValue("description"), filepath.Base(header.Filename), rel).Scan(&id)
	if err != nil {
		os.Remove(full) // не оставляем файл без записи в базе
		serverErr(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]int{"id": id})
}

// GET /api/documents/{id}/file  (свой файл или любой, если методист)
func (a *App) handleDownload(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	u := userFrom(r)

	var ownerID int
	var filename, rel string
	err := a.db.QueryRow(r.Context(), `SELECT teacher_id, filename, path FROM documents WHERE id = $1`, id).
		Scan(&ownerID, &filename, &rel)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && !u.Methodist && ownerID != u.ID) {
		fail(w, http.StatusNotFound, "документ не найден") // чужой документ тоже 404
		return
	}
	if err != nil {
		serverErr(w, err)
		return
	}

	f, err := os.Open(filepath.Join(a.uploadDir, rel))
	if err != nil {
		serverErr(w, err)
		return
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		serverErr(w, err)
		return
	}
	w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": filename}))
	http.ServeContent(w, r, filename, info.ModTime(), f)
}

// DELETE /api/my/documents/{id}  (только свой и ещё не принятый)
func (a *App) handleDeleteMyDocument(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	u := userFrom(r)

	var rel string
	var accepted bool
	err := a.db.QueryRow(r.Context(), `SELECT path, accepted FROM documents WHERE id = $1 AND teacher_id = $2`,
		id, u.ID).Scan(&rel, &accepted)
	if errors.Is(err, pgx.ErrNoRows) {
		fail(w, http.StatusNotFound, "документ не найден")
		return
	}
	if err != nil {
		serverErr(w, err)
		return
	}
	if accepted {
		fail(w, http.StatusConflict, "принятый документ удалить нельзя")
		return
	}
	if _, err := a.db.Exec(r.Context(), `DELETE FROM documents WHERE id = $1`, id); err != nil {
		serverErr(w, err)
		return
	}
	os.Remove(filepath.Join(a.uploadDir, rel))
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}
