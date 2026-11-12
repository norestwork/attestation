ARG GO_VERSION=1.27

# 1. сборка фронтенда
FROM node:22-alpine AS frontend
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi
COPY frontend/ ./
RUN npm run build

# 2. сборка бэкенда
FROM golang:${GO_VERSION}-bookworm AS backend
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY *.go ./
RUN CGO_ENABLED=0 go build -o /out/attestation .

# 3. итоговый образ: бинарник + собранный фронтенд
FROM alpine:3.20
# ca-certificates нужны для TLS при отправке почты, tzdata — чтобы рассылка шла в 9:00 по местному часовому поясу
RUN apk add --no-cache ca-certificates tzdata \
    && adduser -D -u 10001 app \
    && mkdir -p /data/uploads \
    && chown app /data/uploads
WORKDIR /app
COPY --from=backend /out/attestation /app/attestation
COPY --from=frontend /web/dist /app/web
ENV STATIC_DIR=/app/web
USER app
EXPOSE 8080
CMD ["/app/attestation"]