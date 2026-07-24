package handlers

import (
	"crypto/rand"
	"encoding/base64"
	"net/http"
	"time"

	"github.com/flowie/backend/internal/auth"
	"github.com/flowie/backend/internal/httpx"
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

	user, err := h.Store.Users.UpsertFromAzure(r.Context(), claims.ResolvedOID(), email, claims.Name)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "provision_failed", err.Error())
		return
	}

	token, err := h.Sessions.Issue(user.ID, user.Email, user.DisplayName)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "session_failed", err.Error())
		return
	}
	h.Sessions.SetCookie(w, token)

	// Clear one-time flow cookies.
	h.setFlowCookie(w, "oauth_state", "")
	h.setFlowCookie(w, "oauth_nonce", "")

	http.Redirect(w, r, h.Cfg.FrontendURL, http.StatusFound)
}

// Logout clears the session cookie.
func (h *Handlers) Logout(w http.ResponseWriter, r *http.Request) {
	h.Sessions.ClearCookie(w)
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "logged_out"})
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
