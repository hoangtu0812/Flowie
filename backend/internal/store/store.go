// Package store implements data access on top of a pgx connection pool.
package store

import (
	"errors"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrNotFound is returned when a queried row does not exist.
var ErrNotFound = errors.New("not found")

// Store is the aggregate repository handle.
type Store struct {
	pool *pgxpool.Pool

	Users      *UserStore
	Workspaces *WorkspaceStore
	Projects   *ProjectStore
	Tasks      *TaskStore
}

// New builds a Store from a pgx pool.
func New(pool *pgxpool.Pool) *Store {
	return &Store{
		pool:       pool,
		Users:      &UserStore{pool: pool},
		Workspaces: &WorkspaceStore{pool: pool},
		Projects:   &ProjectStore{pool: pool},
		Tasks:      &TaskStore{pool: pool},
	}
}
