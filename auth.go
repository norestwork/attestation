package main

import (
	"context"
	"errors"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"
)

// Сессии хранятся в памяти: для 20 человек достаточно,
// после перезапуска сервера нужно войти заново.
type Session struct {
	UserID    int
	Methodist bool
	Expires   time.Time
}

type Sessions struct {
	mu sync.Mutex
	m  map[string]Session
}

func newSessions() *Sessions { return &Sessions{m: map[string]Session{}} }

func (s *Sessions) create(userID int, methodist bool) (string, time.Time) {
	token := randHex(32)
	exp := time.Now().Add(7 * 24 * time.Hour)
	s.mu.Lock()
	s.m[token] = Session{userID, methodist, exp}
	s.mu.Unlock()
	return token, exp
}

func (s *Sessions) get(token string) (Session, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	sess, ok := s.m[token]
	if ok && time.Now().After(sess.Expires) {
		delete(s.m, token)
		return Session{}, false
	}
	return sess, ok
}

func (s *Sessions) delete(token string) {
	s.mu.Lock()
	delete(s.m, token)
	s.mu.Unlock()
}

type ctxKey struct{}

type User struct {
	ID        int
	Methodist bool
}

func userFrom(r *http.Request) User { return r.Context().Value(ctxKey{}).(User) }

// auth: пускает только вошедших
func (a *App) auth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		c, err := r.Cookie("sid")
		if err != nil {
			fail(w, http.StatusUnauthorized, "нужно войти")
			return
		}
		s, ok := a.sessions.get(c.Value)
		if !ok {
			fail(w, http.StatusUnauthorized, "нужно войти")
			return
		}
		ctx := context.WithValue(r.Context(), ctxKey{}, User{s.UserID, s.Methodist})
		next(w, r.WithContext(ctx))
	}
}

// methodist: только для методиста
func (a *App) methodist(next http.HandlerFunc) http.HandlerFunc {
	return a.auth(func(w http.ResponseWriter, r *http.Request) {
		if !userFrom(r).Methodist {
			fail(w, http.StatusForbidden, "недостаточно прав")
			return
		}
		next(w, r)
	})
}

// POST /api/login
func (a *App) handleLogin(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !decode(w, r, &in) {
		return
	}
	var id int
	var hash string
	var methodist bool
	err := a.db.QueryRow(r.Context(),
		`SELECT id, password_hash, is_methodist FROM teachers WHERE lower(email) = lower($1)`,
		in.Email).Scan(&id, &hash, &methodist)
	if errors.Is(err, pgx.ErrNoRows) {
		fail(w, http.StatusUnauthorized, "неверный email или пароль")
		return
	}
	if err != nil {
		serverErr(w, err)
		return
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(in.Password)) != nil {
		fail(w, http.StatusUnauthorized, "неверный email или пароль")
		return
	}
	token, exp := a.sessions.create(id, methodist)
	http.SetCookie(w, &http.Cookie{
		Name:     "sid",
		Value:    token,
		Path:     "/",
		Expires:  exp,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   os.Getenv("COOKIE_SECURE") == "1", // включите при работе по HTTPS
	})
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// POST /api/logout
func (a *App) handleLogout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie("sid"); err == nil {
		a.sessions.delete(c.Value)
	}
	http.SetCookie(w, &http.Cookie{Name: "sid", Value: "", Path: "/", MaxAge: -1})
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// GET /api/me
func (a *App) handleMe(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r)
	var name, email string
	err := a.db.QueryRow(r.Context(),
		`SELECT full_name, email FROM teachers WHERE id = $1`, u.ID).Scan(&name, &email)
	if err != nil {
		serverErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"id": u.ID, "full_name": name, "email": email, "is_methodist": u.Methodist,
	})
}
