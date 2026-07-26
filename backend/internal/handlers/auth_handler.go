package handlers

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/flowie/backend/internal/auth"
	"github.com/flowie/backend/internal/httpx"
	"github.com/flowie/backend/internal/store"
	"github.com/google/uuid"
)

// randomToken returns a URL-safe random string for CSRF state / OIDC nonce.
func randomToken() string {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

// setFlowCookie stores a short-lived httpOnly cookie used during the OIDC flow.
func (h *Handlers) setFlowCookie(w http.ResponseWriter, name, value string) {
	http.SetCookie(w, &http.Cookie{
		Name:     name,
		Value:    value,
		Path:     "/",
		HttpOnly: true,
		Secure:   h.Cfg.Env != "development",
		SameSite: http.SameSiteLaxMode,
		Expires:  time.Now().Add(10 * time.Minute),
	})
}

// AzureLogin starts the Azure AD SSO flow by redirecting to the authorize URL.
func (h *Handlers) AzureLogin(w http.ResponseWriter, r *http.Request) {
	if h.Azure == nil {
		httpx.Error(w, http.StatusServiceUnavailable, "sso_disabled", "Azure AD is not configured")
		return
	}
	state := randomToken()
	nonce := randomToken()
	h.setFlowCookie(w, "oauth_state", state)
	h.setFlowCookie(w, "oauth_nonce", nonce)
	http.Redirect(w, r, h.Azure.AuthCodeURL(state, nonce), http.StatusFound)
}

// AzureCallback handles the OAuth2 redirect from Azure AD: it validates state,
// exchanges the code, provisions the user, issues a session, and redirects to
// the frontend.
func (h *Handlers) AzureCallback(w http.ResponseWriter, r *http.Request) {
	if h.Azure == nil {
		httpx.Error(w, http.StatusServiceUnavailable, "sso_disabled", "Azure AD is not configured")
		return
	}
	if errMsg := r.URL.Query().Get("error"); errMsg != "" {
		httpx.Error(w, http.StatusBadRequest, "sso_error", r.URL.Query().Get("error_description"))
		return
	}

	// Validate CSRF state.
	stateCookie, err := r.Cookie("oauth_state")
	if err != nil || stateCookie.Value == "" || stateCookie.Value != r.URL.Query().Get("state") {
		httpx.Error(w, http.StatusBadRequest, "state_mismatch", "invalid oauth state")
		return
	}
	nonceCookie, err := r.Cookie("oauth_nonce")
	if err != nil || nonceCookie.Value == "" {
		httpx.Error(w, http.StatusBadRequest, "nonce_missing", "missing oauth nonce")
		return
	}

	claims, err := h.Azure.Exchange(r.Context(), r.URL.Query().Get("code"), nonceCookie.Value)
	if err != nil {
		httpx.Error(w, http.StatusUnauthorized, "sso_exchange_failed", err.Error())
		return
	}

	email := claims.ResolvedEmail()
	if email == "" || claims.ResolvedOID() == "" {
		httpx.Error(w, http.StatusBadRequest, "insufficient_claims", "missing email or oid in token")
		return
	}

	isAdmin := false
	for _, e := range h.Cfg.SystemAdminEmails {
		if strings.EqualFold(e, email) {
			isAdmin = true
			break
		}
	}

	user, err := h.Store.Users.UpsertFromAzure(r.Context(), claims.ResolvedOID(), email, claims.Name, claims.Picture, isAdmin)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "provision_failed", err.Error())
		return
	}

	// Clear one-time flow cookies.
	h.setFlowCookie(w, "oauth_state", "")
	h.setFlowCookie(w, "oauth_nonce", "")

	// When MFA is on, hand out a short-lived challenge token instead of a
	// session and send the user to the 2FA step.
	if st, sErr := h.Store.Users.TwoFactor(r.Context(), user.ID); sErr == nil && st.Enabled {
		pending, pErr := h.Sessions.IssuePending(user.ID, user.Email, user.DisplayName)
		if pErr != nil {
			httpx.Error(w, http.StatusInternalServerError, "session_failed", pErr.Error())
			return
		}
		h.Sessions.SetCookie(w, pending)
		http.Redirect(w, r, h.Cfg.FrontendURL+"/login/2fa", http.StatusFound)
		return
	}

	token, err := h.Sessions.Issue(user.ID, user.Email, user.DisplayName)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "session_failed", err.Error())
		return
	}
	h.Sessions.SetCookie(w, token)
	h.recordSession(r, user.ID, token)
	h.auditFor(r, user.ID, user.Email, store.AuditLogin, "azure_ad", nil)

	http.Redirect(w, r, h.Cfg.FrontendURL, http.StatusFound)
}

// DevLogin is a DEVELOPMENT-ONLY endpoint that provisions a user and sets the
// session cookie without Azure AD, so the UI can be exercised locally. It is a
// no-op (404) unless APP_ENV=development.
func (h *Handlers) DevLogin(w http.ResponseWriter, r *http.Request) {
	if h.Cfg.Env != "development" {
		httpx.Error(w, http.StatusNotFound, "not_found", "")
		return
	}
	email := r.URL.Query().Get("email")
	if email == "" {
		email = "dev@flowie.local"
	}
	name := r.URL.Query().Get("name")
	if name == "" {
		name = "Dev User"
	}

	isAdmin := false
	for _, e := range h.Cfg.SystemAdminEmails {
		if strings.EqualFold(e, email) {
			isAdmin = true
			break
		}
	}

	user, err := h.Store.Users.UpsertFromAzure(r.Context(), "dev|"+email, email, name, "", isAdmin)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "provision_failed", err.Error())
		return
	}
	// Dev login honours MFA too, so the challenge flow can be exercised locally
	// and this endpoint never becomes a way to bypass 2FA.
	if st, sErr := h.Store.Users.TwoFactor(r.Context(), user.ID); sErr == nil && st.Enabled {
		pending, pErr := h.Sessions.IssuePending(user.ID, user.Email, user.DisplayName)
		if pErr != nil {
			httpx.Error(w, http.StatusInternalServerError, "session_failed", pErr.Error())
			return
		}
		h.Sessions.SetCookie(w, pending)
		if r.URL.Query().Get("redirect") != "" {
			http.Redirect(w, r, h.Cfg.FrontendURL+"/login/2fa", http.StatusFound)
			return
		}
		httpx.JSON(w, http.StatusOK, map[string]any{"mfaRequired": true})
		return
	}

	token, err := h.Sessions.Issue(user.ID, user.Email, user.DisplayName)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "session_failed", err.Error())
		return
	}
	h.Sessions.SetCookie(w, token)
	h.recordSession(r, user.ID, token)
	// Redirect to the frontend if asked, else return JSON.
	if r.URL.Query().Get("redirect") != "" {
		http.Redirect(w, r, h.Cfg.FrontendURL, http.StatusFound)
		return
	}
	httpx.JSON(w, http.StatusOK, user)
}

// recordSession stores an issued session so it can be listed and revoked from
// the account page. Failures are non-fatal: login must not break because the
// device list could not be written.
func (h *Handlers) recordSession(r *http.Request, userID uuid.UUID, token string) {
	ip := r.Header.Get("X-Forwarded-For")
	if ip == "" {
		ip = r.RemoteAddr
	}
	device := r.UserAgent()
	if len(device) > 400 {
		device = device[:400]
	}
	_ = h.Store.Sessions.Create(r.Context(), userID, auth.HashToken(token),
		device, ip, time.Now().Add(h.Sessions.TTL()))
}

// Logout clears the session cookie and revokes the session server-side.
func (h *Handlers) Logout(w http.ResponseWriter, r *http.Request) {
	if tok := auth.TokenFromRequest(r); tok != "" {
		_ = h.Store.Sessions.RevokeByToken(r.Context(), auth.HashToken(tok))
	}
	h.Sessions.ClearCookie(w)
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "logged_out"})
}

// ListSessions returns the caller's active devices/sessions.
func (h *Handlers) ListSessions(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserID(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthenticated", "")
		return
	}
	sessions, err := h.Store.Sessions.ListForUser(r.Context(), userID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "list_failed", err.Error())
		return
	}
	// Flag the session making this request so the UI can label it.
	if tok := auth.TokenFromRequest(r); tok != "" {
		if curID, err := h.Store.Sessions.IDByToken(r.Context(), auth.HashToken(tok)); err == nil {
			store.MarkCurrent(sessions, curID)
		}
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"sessions": sessions})
}

// RevokeSession revokes one of the caller's sessions (remote logout).
func (h *Handlers) RevokeSession(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserID(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthenticated", "")
		return
	}
	sessionID, ok := parseUUIDParam(w, r, "sessionID")
	if !ok {
		return
	}
	h.audit(r, store.AuditSessionRevoked, sessionID.String(), nil, nil)
	if err := h.Store.Sessions.Revoke(r.Context(), userID, sessionID); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "session not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "revoke_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

// DevMakeAdmin (DEV ONLY) makes the caller a system admin instantly.
func (h *Handlers) DevMakeAdmin(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserID(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthenticated", "")
		return
	}
	err := h.Store.Users.SetSystemAdmin(r.Context(), userID, true)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "db_error", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"message": "You are now an admin"})
}

// Me returns the currently authenticated user's profile.
func (h *Handlers) Me(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserID(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthenticated", "")
		return
	}
	user, err := h.Store.Users.GetByID(r.Context(), userID)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "user not found")
		return
	}
	httpx.JSON(w, http.StatusOK, user)
}
