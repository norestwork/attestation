package main

import (
	"net/http"
	"os"
	"path/filepath"
	"strconv"

	"golang.org/x/crypto/bcrypt"
)

// GET /api/teachers — сводка (представление summary)
func (a *App) handleTeachers(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.Query(r.Context(), `SELECT s.id, s.full_name, t.email, coalesce(s.readiness_pct, 0)::int,
			s.attested_at::text, s.ends_at::text, s.deadline::text
		FROM summary s JOIN teachers t ON t.id = s.id ORDER BY s.full_name`)
	if err != nil {
		serverErr(w, err)
		return
	}
	defer rows.Close()
	type row struct {
		ID           int     `json:"id"`
		FullName     string  `json:"full_name"`
		Email        string  `json:"email"`
		ReadinessPct int     `json:"readiness_pct"`
		AttestedAt   *string `json:"attested_at"`
		EndsAt       *string `json:"ends_at"`
		Deadline     *string `json:"deadline"`
	}
	list := make([]row, 0)
	for rows.Next() {
		var t row
		if err := rows.Scan(&t.ID, &t.FullName, &t.Email, &t.ReadinessPct, &t.AttestedAt, &t.EndsAt, &t.Deadline); err != nil {
			serverErr(w, err)
			return
		}
		list = append(list, t)
	}
	writeJSON(w, http.StatusOK, list)
}

// POST /api/teachers
func (a *App) handleCreateTeacher(w http.ResponseWriter, r *http.Request) {
	var in struct {
		FullName   string `json:"full_name"`
		Email      string `json:"email"`
		Password   string `json:"password"`
		AttestedAt string `json:"attested_at"` // "2023-04-07", можно пусто
	}
	if !decode(w, r, &in) {
		return
	}
	if in.FullName == "" || in.Email == "" || len(in.Password) < 6 {
		fail(w, http.StatusBadRequest, "нужны ФИО, email и пароль от 6 символов")
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(in.Password), bcrypt.DefaultCost)
	if err != nil {
		serverErr(w, err)
		return
	}
	var id int
	err = a.db.QueryRow(r.Context(), `INSERT INTO teachers (full_name, email, password_hash, attested_at)
		VALUES ($1, $2, $3, NULLIF($4::text, '')::date) RETURNING id`,
		in.FullName, in.Email, string(hash), in.AttestedAt).Scan(&id)
	if isUnique(err) {
		fail(w, http.StatusConflict, "такой email уже есть")
		return
	}
	if err != nil {
		fail(w, http.StatusBadRequest, "не удалось создать (проверьте формат даты ГГГГ-ММ-ДД)")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]int{"id": id})
}

// PATCH /api/teachers/{id} — меняются только присланные поля
func (a *App) handleUpdateTeacher(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var in struct {
		FullName   *string `json:"full_name"`
		Email      *string `json:"email"`
		AttestedAt *string `json:"attested_at"` // "" очищает дату
		Password   *string `json:"password"`
	}
	if !decode(w, r, &in) {
		return
	}
	var hash *string
	if in.Password != nil && *in.Password != "" {
		h, err := bcrypt.GenerateFromPassword([]byte(*in.Password), bcrypt.DefaultCost)
		if err != nil {
			serverErr(w, err)
			return
		}
		s := string(h)
		hash = &s
	}
	// при смене даты присвоения счётчик предупреждений сбрасывается
	tag, err := a.db.Exec(r.Context(), `UPDATE teachers SET
			full_name     = COALESCE($2::text, full_name),
			email         = COALESCE($3::text, email),
			password_hash = COALESCE($5::text, password_hash),
			notified_at   = CASE WHEN $4::text IS NULL THEN notified_at ELSE NULL END,
			attested_at   = CASE WHEN $4::text IS NULL THEN attested_at ELSE NULLIF($4::text, '')::date END
		WHERE id = $1`, id, in.FullName, in.Email, in.AttestedAt, hash)
	if isUnique(err) {
		fail(w, http.StatusConflict, "такой email уже есть")
		return
	}
	if err != nil {
		fail(w, http.StatusBadRequest, "не удалось обновить (проверьте формат даты ГГГГ-ММ-ДД)")
		return
	}
	if tag.RowsAffected() == 0 {
		fail(w, http.StatusNotFound, "преподаватель не найден")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// DELETE /api/teachers/{id} — вместе с документами и папкой с файлами
func (a *App) handleDeleteTeacher(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	if id == userFrom(r).ID {
		fail(w, http.StatusBadRequest, "нельзя удалить самого себя")
		return
	}
	tag, err := a.db.Exec(r.Context(), `DELETE FROM teachers WHERE id = $1`, id) // документы удалятся каскадом
	if err != nil {
		serverErr(w, err)
		return
	}
	if tag.RowsAffected() == 0 {
		fail(w, http.StatusNotFound, "преподаватель не найден")
		return
	}
	os.RemoveAll(filepath.Join(a.uploadDir, strconv.Itoa(id)))
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// GET /api/teachers/{id}/documents
func (a *App) handleTeacherDocuments(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	docs, err := a.listDocs(r.Context(), id)
	if err != nil {
		serverErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, docs)
}

// PATCH /api/documents/{id} — принять или отклонить: {"accepted": true}
func (a *App) handleReviewDocument(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var in struct {
		Accepted bool `json:"accepted"`
	}
	if !decode(w, r, &in) {
		return
	}
	tag, err := a.db.Exec(r.Context(), `UPDATE documents SET accepted = $2 WHERE id = $1`, id, in.Accepted)
	if err != nil {
		serverErr(w, err)
		return
	}
	if tag.RowsAffected() == 0 {
		fail(w, http.StatusNotFound, "документ не найден")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// POST /api/notify/run — ручной запуск рассылки (для проверки)
func (a *App) handleNotifyRun(w http.ResponseWriter, r *http.Request) {
	n, err := a.notify(r.Context())
	if err != nil {
		serverErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]int{"sent": n})
}
