// Command api is the Flowie backend HTTP server.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/flowie/backend/internal/auth"
	"github.com/flowie/backend/internal/config"
	"github.com/flowie/backend/internal/db"
	"github.com/flowie/backend/internal/handlers"
	"github.com/flowie/backend/internal/server"
	"github.com/flowie/backend/internal/storage/sharepoint"
	"github.com/flowie/backend/internal/store"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	if err := run(); err != nil {
		slog.Error("fatal", "error", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// Database.
	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()

	if err := db.Migrate(ctx, pool); err != nil {
		return err
	}
	slog.Info("migrations applied")

	st := store.New(pool)

	// Azure AD (OIDC) — optional so the server can boot without SSO configured.
	// Discovery failures (bad tenant, network) disable SSO but must not stop the
	// rest of the API from serving.
	azure, err := auth.NewAzureProvider(ctx, cfg.Azure)
	if err != nil {
		slog.Warn("Azure AD discovery failed — SSO endpoints disabled", "error", err)
		azure = nil
	} else if azure == nil {
		slog.Warn("Azure AD not configured — SSO endpoints disabled")
	} else {
		slog.Info("Azure AD SSO enabled")
	}

	// SharePoint — optional.
	sp := sharepoint.New(cfg.SharePoint)
	if sp == nil {
		slog.Warn("SharePoint not configured — file storage disabled")
	}

	sessions := auth.NewSessionManager(cfg.SessionSecret, cfg.SessionTTL, cfg.Env != "development")
	h := handlers.New(cfg, st, sessions, azure, sp)
	router := server.NewRouter(cfg, h, sessions)

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           router,
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		slog.Info("server listening", "addr", srv.Addr, "env", cfg.Env)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("server error", "error", err)
			stop()
		}
	}()

	<-ctx.Done()
	slog.Info("shutting down")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return srv.Shutdown(shutdownCtx)
}
