# ── Build stage ──
FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/api ./cmd/api

# ── Runtime stage ──
FROM alpine:3.20
RUN apk add --no-cache ca-certificates && adduser -D -u 10001 flowie
USER flowie
WORKDIR /app
COPY --from=build /out/api /app/api
EXPOSE 8080
ENTRYPOINT ["/app/api"]
