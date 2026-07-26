package auth

import (
	"context"
	"net/http"

	"github.com/flowie/backend/internal/httpx"
	"github.com/google/uuid"
)

type ctxKey int

const userIDKey ctxKey = iota

// RequireAuth is middleware that rejects unauthenticated requests and injects
// the authenticated user id into the request context.
func (m *SessionManager) RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tok := tokenFromRequest(r)
		if tok == "" {
			httpx.Error(w, http.StatusUnauthorized, "unauthenticated", "missing session")
			return
		}
		claims, err := m.Verify(tok)
		if err != nil {
			httpx.Error(w, http.StatusUnauthorized, "unauthenticated", "invalid session")
			return
		}
		userID, err := uuid.Parse(claims.Subject)
		if err != nil {
			httpx.Error(w, http.StatusUnauthorized, "unauthenticated", "invalid subject")
			return
		}
		// A half-authenticated session may only finish the MFA challenge.
		if claims.MFAPending {
			httpx.Error(w, http.StatusUnauthorized, "mfa_required", "two-factor verification required")
			return
		}
		// Honour remote revocation when a session registry is configured.
		if m.registry != nil {
			hash := HashToken(tok)
			revoked, err := m.registry.IsRevoked(r.Context(), hash)
			if err != nil {
				httpx.Error(w, http.StatusInternalServerError, "session_check_failed", err.Error())
				return
			}
			if revoked {
				httpx.Error(w, http.StatusUnauthorized, "session_revoked", "session has been revoked")
				return
			}
			m.registry.Touch(r.Context(), hash)
		}
		ctx := context.WithValue(r.Context(), userIDKey, userID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// UserID extracts the authenticated user id from the context.
func UserID(ctx context.Context) (uuid.UUID, bool) {
	id, ok := ctx.Value(userIDKey).(uuid.UUID)
	return id, ok
}
