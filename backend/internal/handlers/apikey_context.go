package handlers

import (
	"context"

	"github.com/flowie/backend/internal/store"
)

// contextWithKey stores the resolved API key for the request.
func contextWithKey(ctx context.Context, k *store.ResolvedKey) context.Context {
	return context.WithValue(ctx, apiKeyCtxKey{}, k)
}

// keyFromContext retrieves the API key placed by RequireAPIKey.
func keyFromContext(ctx context.Context) (*store.ResolvedKey, bool) {
	k, ok := ctx.Value(apiKeyCtxKey{}).(*store.ResolvedKey)
	return k, ok
}
