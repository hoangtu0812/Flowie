.PHONY: run build tidy test lint fmt migrate docker

# Load .env from repo root if present (dev convenience).
ifneq (,$(wildcard ../.env))
	include ../.env
	export
endif

run: ## Run the API server (applies migrations on boot)
	go run ./cmd/api

build: ## Compile the API binary into ./bin
	go build -o bin/api ./cmd/api

tidy: ## Sync go.mod/go.sum
	go mod tidy

test: ## Run tests
	go test ./...

fmt: ## Format code
	go fmt ./...

vet: ## Static checks
	go vet ./...

docker: ## Build the backend docker image
	docker build -t flowie-backend .
