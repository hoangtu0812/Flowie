// Command devtoken is a DEVELOPMENT-ONLY helper. It provisions a user directly
// in the database and prints a valid session token, so the API can be exercised
// before Azure AD SSO is configured. It refuses to run when APP_ENV=production.
//
// Usage:
//
//	go run ./cmd/devtoken -email you@example.com -name "Your Name"
package main

import (
	"context"
	"flag"
	"fmt"
	"os"

	"github.com/flowie/backend/internal/auth"
	"github.com/flowie/backend/internal/config"
	"github.com/flowie/backend/internal/db"
	"github.com/flowie/backend/internal/store"
)

func main() {
	email := flag.String("email", "dev@flowie.local", "user email")
	name := flag.String("name", "Dev User", "display name")
	flag.Parse()

	if os.Getenv("APP_ENV") == "production" {
		fmt.Fprintln(os.Stderr, "refusing to run in production")
		os.Exit(1)
	}

	cfg, err := config.Load()
	if err != nil {
		fatal(err)
	}
	ctx := context.Background()
	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		fatal(err)
	}
	defer pool.Close()

	st := store.New(pool)
	// azure_oid derived from email so repeated runs are idempotent.
	// Local dev tokens get system-admin so the admin panel is reachable.
	user, err := st.Users.UpsertFromAzure(ctx, "dev|"+*email, *email, *name, "", true)
	if err != nil {
		fatal(err)
	}

	sm := auth.NewSessionManager(cfg.SessionSecret, cfg.SessionTTL, false)
	token, err := sm.Issue(user.ID, user.Email, user.DisplayName)
	if err != nil {
		fatal(err)
	}

	fmt.Printf("user_id: %s\n", user.ID)
	fmt.Printf("token:   %s\n", token)
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, "error:", err)
	os.Exit(1)
}
