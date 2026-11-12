package main

import (
	"context"
	"fmt"
	"log"
	"mime"
	"net/smtp"
	"time"
)

type Mailer struct {
	host, port, user, pass, from string
}

// Send: если SMTP_HOST не задан, письмо только пишется в лог (удобно для проверки).
// Порт 587 (STARTTLS) работает; порт 465 (неявный TLS) этим способом не поддерживается.
func (m *Mailer) Send(to, subject, body string) error {
	if m.host == "" {
		log.Printf("[письмо-заглушка] кому=%s тема=%s\n%s", to, subject, body)
		return nil
	}
	msg := "From: " + m.from + "\r\n" +
		"To: " + to + "\r\n" +
		"Subject: " + mime.QEncoding.Encode("utf-8", subject) + "\r\n" +
		"MIME-Version: 1.0\r\n" +
		"Content-Type: text/plain; charset=UTF-8\r\n\r\n" + body
	auth := smtp.PlainAuth("", m.user, m.pass, m.host)
	return smtp.SendMail(m.host+":"+m.port, auth, m.from, []string{to}, []byte(msg))
}

type dueRow struct {
	id                      int
	name, email, deadline   string
	days                    int
}

// notify: находит тех, у кого дедлайн близко, шлёт письма, отмечает notified_at
func (a *App) notify(ctx context.Context) (int, error) {
	rows, err := a.db.Query(ctx, `SELECT s.id, s.full_name, t.email, s.deadline::text, (s.deadline - current_date)
		FROM summary s JOIN teachers t ON t.id = s.id
		WHERE s.deadline <= current_date + $1::int
		  AND (t.notified_at IS NULL OR t.notified_at < current_date - $2::int)`, warnDays, repeatDays)
	if err != nil {
		return 0, err
	}
	var due []dueRow
	for rows.Next() {
		var d dueRow
		if err := rows.Scan(&d.id, &d.name, &d.email, &d.deadline, &d.days); err != nil {
			rows.Close()
			return 0, err
		}
		due = append(due, d)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}

	sent := 0
	for _, d := range due {
		var text string
		if d.days >= 0 {
			text = fmt.Sprintf("До срока подачи документов на аттестацию осталось дней: %d (дедлайн %s).", d.days, d.deadline)
		} else {
			text = fmt.Sprintf("Срок подачи документов на аттестацию прошёл %s.", d.deadline)
		}
		body := fmt.Sprintf("Здравствуйте, %s!\n\n%s\nПожалуйста, загрузите недостающие документы в личном кабинете.\n", d.name, text)
		if err := a.mail.Send(d.email, "Напоминание: срок аттестации", body); err != nil {
			log.Printf("не удалось отправить %s: %v", d.email, err)
			continue
		}
		if _, err := a.db.Exec(ctx, `UPDATE teachers SET notified_at = current_date WHERE id = $1`, d.id); err != nil {
			log.Println("не удалось отметить notified_at:", err)
		}
		sent++
	}
	return sent, nil
}

// notifyLoop: раз в сутки в 9:00 по времени сервера
func (a *App) notifyLoop() {
	for {
		now := time.Now()
		next := time.Date(now.Year(), now.Month(), now.Day(), 9, 0, 0, 0, now.Location())
		if !next.After(now) {
			next = next.AddDate(0, 0, 1)
		}
		time.Sleep(time.Until(next))
		n, err := a.notify(context.Background())
		if err != nil {
			log.Println("рассылка:", err)
			continue
		}
		log.Printf("рассылка: отправлено писем %d", n)
	}
}
