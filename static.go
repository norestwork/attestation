package main

import (
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
)

// spaHandler раздаёт собранный фронтенд (папка dist, в контейнере /app/web).
// Если файл с таким адресом есть (скрипты, стили), отдаёт его. Для любого другого адреса,
// например /teachers/3, отдаёт index.html: дальше маршрут разбирает React Router.
func spaHandler(dir string) http.Handler {
	files := http.FileServer(http.Dir(dir))
	index := filepath.Join(dir, "index.html")

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			fail(w, http.StatusMethodNotAllowed, "метод не поддерживается")
			return
		}

		p := path.Clean("/" + r.URL.Path) // убирает ".." и двойные слэши
		if info, err := os.Stat(filepath.Join(dir, filepath.FromSlash(p))); err == nil && !info.IsDir() {
			if strings.HasPrefix(p, "/assets/") {
				// имена файлов в assets содержат хэш содержимого, их можно кэшировать надолго
				w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
			}
			files.ServeHTTP(w, r)
			return
		}

		// страница приложения: не кэшируем, чтобы после обновления сразу подтягивались новые скрипты
		w.Header().Set("Cache-Control", "no-cache")
		http.ServeFile(w, r, index)
	})
}
