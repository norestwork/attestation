package main

import (
	"context"
	"log"
	"net/http"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

const (
	maxUpload  = 10 << 20 // 10 МБ на файл
	warnDays   = 30       // предупреждать, если до дедлайна <= 30 дней
	repeatDays = 7        // и не чаще раза в 7 дней
)

type App struct {
	db        *pgxpool.Pool
	uploadDir string
	staticDir string // собранный фронтенд
	sessions  *Sessions
	mail      *Mailer
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func main() {
	ctx := context.Background()
	db, err := pgxpool.New(ctx, env("DATABASE_URL", "postgres://localhost/attestation"))
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	app := &App{
		db:        db,
		uploadDir: env("UPLOAD_DIR", "./uploads"),
		staticDir: env("STATIC_DIR", "./web"),
		sessions:  newSessions(),
		mail: &Mailer{
			host: os.Getenv("SMTP_HOST"),
			port: env("SMTP_PORT", "587"),
			user: os.Getenv("SMTP_USER"),
			pass: os.Getenv("SMTP_PASS"),
			from: env("SMTP_FROM", os.Getenv("SMTP_USER")),
		},
	}
	if err := os.MkdirAll(app.uploadDir, 0o755); err != nil {
		log.Fatal(err)
	}

	// go run . create-methodist "ФИО" email пароль
	if len(os.Args) == 5 && os.Args[1] == "create-methodist" {
		hash, _ := bcrypt.GenerateFromPassword([]byte(os.Args[4]), bcrypt.DefaultCost)
		_, err := db.Exec(ctx, `INSERT INTO teachers (full_name, email, password_hash, is_methodist)
			VALUES ($1, $2, $3, true)`, os.Args[2], os.Args[3], string(hash))
		if err != nil {
			log.Fatal(err)
		}
		log.Println("методист создан")
		return
	}

	go app.notifyLoop()

	addr := env("ADDR", ":8080")
	log.Println("слушаю", addr)
	log.Fatal(http.ListenAndServe(addr, app.routes()))
}

func (a *App) routes() http.Handler {
	mux := http.NewServeMux()

	// общие
	mux.HandleFunc("POST /api/login", a.handleLogin)
	mux.HandleFunc("POST /api/logout", a.handleLogout)
	mux.HandleFunc("GET /api/me", a.auth(a.handleMe))
	mux.HandleFunc("GET /api/criteria", a.auth(a.handleCriteria))
	mux.HandleFunc("GET /api/documents/{id}/file", a.auth(a.handleDownload))

	// преподаватель (только свои данные)
	mux.HandleFunc("GET /api/my/status", a.auth(a.handleMyStatus))
	mux.HandleFunc("GET /api/my/documents", a.auth(a.handleMyDocuments))
	mux.HandleFunc("POST /api/my/documents", a.auth(a.handleUpload))
	mux.HandleFunc("DELETE /api/my/documents/{id}", a.auth(a.handleDeleteMyDocument))

	// методист
	mux.HandleFunc("GET /api/teachers", a.methodist(a.handleTeachers))
	mux.HandleFunc("POST /api/teachers", a.methodist(a.handleCreateTeacher))
	mux.HandleFunc("PATCH /api/teachers/{id}", a.methodist(a.handleUpdateTeacher))
	mux.HandleFunc("DELETE /api/teachers/{id}", a.methodist(a.handleDeleteTeacher))
	mux.HandleFunc("GET /api/teachers/{id}/documents", a.methodist(a.handleTeacherDocuments))
	mux.HandleFunc("PATCH /api/documents/{id}", a.methodist(a.handleReviewDocument))
	mux.HandleFunc("POST /api/notify/run", a.methodist(a.handleNotifyRun))

	// неизвестные адреса /api отдают ошибку, а не страницу фронтенда
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		fail(w, http.StatusNotFound, "нет такого метода API")
	})

	// всё остальное — фронтенд (если папка с ним есть)
	if st, err := os.Stat(a.staticDir); err == nil && st.IsDir() {
		mux.Handle("/", spaHandler(a.staticDir))
	} else {
		log.Printf("папка с фронтенд-сборкой %q не найдена, работает только API", a.staticDir)
	}

	return mux
}
