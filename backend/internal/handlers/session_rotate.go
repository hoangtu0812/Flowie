package handlers

import (
	"net/http"
	"time"

	"github.com/flowie/backend/internal/auth"
	"github.com/flowie/backend/internal/httpx"
)

// rotateThreshold is how close to expiry a session must be before the client is
// given a fresh token. Rotating on every request would churn the database and
// invalidate parallel in-flight requests.
const rotateThreshold = 6 * time.Hour

// RefreshSession issues a new session token for an already-authenticated
// caller and retires the old one.
//
// This is token rotation rather than a separate refresh-token grant: Flowie's
// session already lives in an httpOnly cookie backed by a revocable row, so
// rotating that single credential gives the same benefit (a leaked token stops
// working after the next rotation) without a second token type to protect.
func (h *Handlers) RefreshSession(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserID(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthenticated", "")
		return
	}
	oldToken := auth.TokenFromRequest(r)
	if oldToken == "" {
		httpx.Error(w, http.StatusUnauthorized, "unauthenticated", "missing session")
		return
	}
	claims, err := h.Sessions.Verify(oldToken)
	if err != nil {
		httpx.Error(w, http.StatusUnauthorized, "unauthenticated", "invalid session")
		return
	}

	// Only rotate when the session is actually approaching expiry, unless the
	// caller explicitly forces it (used right after a privilege change).
	force := r.URL.Query().Get("force") == "1"
	if !force && claims.ExpiresAt != nil {
		if time.Until(claims.ExpiresAt.Time) > rotateThreshold {
			httpx.JSON(w, http.StatusOK, map[string]any{
				"rotated":   false,
				"expiresAt": claims.ExpiresAt.Time,
			})
			return
		}
	}

	user, err := h.Store.Users.GetByID(r.Context(), userID)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "user not found")
		return
	}
	newToken, err := h.Sessions.Issue(user.ID, user.Email, user.DisplayName)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "session_failed", err.Error())
		return
	}

	expires := time.Now().Add(h.Sessions.TTL())
	// Move the existing device row onto the new token. If the old hash is not
	// tracked (a session predating device tracking), record a new row instead
	// so rotation still works.
	if err := h.Store.Sessions.Rotate(r.Context(), userID,
		auth.HashToken(oldToken), auth.HashToken(newToken), expires); err != nil {
		h.recordSession(r, user.ID, newToken)
	}

	h.Sessions.SetCookie(w, newToken)
	httpx.JSON(w, http.StatusOK, map[string]any{
		"rotated":   true,
		"expiresAt": expires,
	})
}
