package handlers

import (
	"net/http"
	"strings"
	"time"

	"github.com/flowie/backend/internal/auth"
	"github.com/flowie/backend/internal/httpx"
	"github.com/flowie/backend/internal/store"
	"github.com/google/uuid"
)

// pendingUserID extracts the subject of a half-authenticated (MFA-pending)
// token. RequireAuth rejects those tokens, so the challenge endpoints read them
// directly instead of going through the middleware.
func (h *Handlers) pendingUserID(r *http.Request) (uuid.UUID, string, bool) {
	tok := auth.TokenFromRequest(r)
	if tok == "" {
		return uuid.Nil, "", false
	}
	claims, err := h.Sessions.Verify(tok)
	if err != nil || !claims.MFAPending {
		return uuid.Nil, "", false
	}
	id, err := uuid.Parse(claims.Subject)
	if err != nil {
		return uuid.Nil, "", false
	}
	return id, tok, true
}

// TwoFactorStatus reports whether MFA is enabled for the caller.
func (h *Handlers) TwoFactorStatus(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserID(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthenticated", "")
		return
	}
	st, err := h.Store.Users.TwoFactor(r.Context(), userID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "lookup_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{
		"enabled":           st.Enabled,
		"recoveryCodesLeft": st.RecoveryLen,
		"enrolmentStarted":  st.Secret != "" && !st.Enabled,
	})
}

// StartTwoFactor generates a secret and returns the provisioning URI to scan.
// MFA is not active until the user confirms a code via EnableTwoFactor.
func (h *Handlers) StartTwoFactor(w http.ResponseWriter, r *http.Request) {
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
	secret, err := auth.NewTOTPSecret()
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "secret_failed", err.Error())
		return
	}
	if err := h.Store.Users.StartTOTPEnrolment(r.Context(), userID, secret); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "save_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{
		"secret":          secret,
		"provisioningUri": auth.TOTPProvisioningURI(secret, user.Email, "Flowie"),
	})
}

type totpCodeRequest struct {
	Code string `json:"code"`
}

// EnableTwoFactor confirms enrolment and returns one-time recovery codes.
func (h *Handlers) EnableTwoFactor(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserID(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthenticated", "")
		return
	}
	var req totpCodeRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	st, err := h.Store.Users.TwoFactor(r.Context(), userID)
	if err != nil || st.Secret == "" {
		httpx.Error(w, http.StatusBadRequest, "no_enrolment", "hãy bắt đầu thiết lập 2FA trước")
		return
	}
	if !auth.VerifyTOTP(st.Secret, req.Code, time.Now()) {
		httpx.Error(w, http.StatusBadRequest, "invalid_code", "mã xác thực không đúng")
		return
	}

	codes, err := auth.NewRecoveryCodes(8)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "codes_failed", err.Error())
		return
	}
	hashed := make([]string, len(codes))
	for i, c := range codes {
		hashed[i] = store.HashRecoveryCode(c)
	}
	if err := h.Store.Users.EnableTOTP(r.Context(), userID, hashed); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "enable_failed", err.Error())
		return
	}
	h.audit(r, store.AuditMFAEnabled, "totp", nil, nil)
	// Clear-text codes are shown exactly once, here.
	httpx.JSON(w, http.StatusOK, map[string]any{"enabled": true, "recoveryCodes": codes})
}

// DisableTwoFactor turns MFA off after re-confirming a code.
func (h *Handlers) DisableTwoFactor(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserID(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthenticated", "")
		return
	}
	var req totpCodeRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	st, err := h.Store.Users.TwoFactor(r.Context(), userID)
	if err != nil || !st.Enabled {
		httpx.Error(w, http.StatusBadRequest, "not_enabled", "2FA chưa được bật")
		return
	}
	if !auth.VerifyTOTP(st.Secret, req.Code, time.Now()) {
		// A recovery code also authorises turning MFA off.
		used, _ := h.Store.Users.ConsumeRecoveryCode(r.Context(), userID, strings.TrimSpace(req.Code))
		if !used {
			httpx.Error(w, http.StatusBadRequest, "invalid_code", "mã xác thực không đúng")
			return
		}
	}
	if err := h.Store.Users.DisableTOTP(r.Context(), userID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "disable_failed", err.Error())
		return
	}
	h.audit(r, store.AuditMFADisabled, "totp", nil, nil)
	httpx.JSON(w, http.StatusOK, map[string]any{"enabled": false})
}

// VerifyTwoFactor completes login: it swaps an MFA-pending token for a full
// session once the code (or a recovery code) checks out.
func (h *Handlers) VerifyTwoFactor(w http.ResponseWriter, r *http.Request) {
	userID, _, ok := h.pendingUserID(r)
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "no_challenge", "không có phiên chờ xác thực 2FA")
		return
	}
	var req totpCodeRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	st, err := h.Store.Users.TwoFactor(r.Context(), userID)
	if err != nil || !st.Enabled {
		httpx.Error(w, http.StatusBadRequest, "not_enabled", "2FA chưa được bật")
		return
	}

	code := strings.TrimSpace(req.Code)
	valid := auth.VerifyTOTP(st.Secret, code, time.Now())
	if !valid {
		used, _ := h.Store.Users.ConsumeRecoveryCode(r.Context(), userID, code)
		valid = used
	}
	if !valid {
		httpx.Error(w, http.StatusUnauthorized, "invalid_code", "mã xác thực không đúng")
		return
	}

	user, err := h.Store.Users.GetByID(r.Context(), userID)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "user not found")
		return
	}
	token, err := h.Sessions.Issue(user.ID, user.Email, user.DisplayName)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "session_failed", err.Error())
		return
	}
	h.Sessions.SetCookie(w, token)
	h.recordSession(r, user.ID, token)
	h.auditFor(r, user.ID, user.Email, store.AuditMFAVerified, "totp", nil)
	httpx.JSON(w, http.StatusOK, user)
}
