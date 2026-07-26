package handlers

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/flowie/backend/internal/auth"
	"github.com/flowie/backend/internal/httpx"
	"github.com/flowie/backend/internal/store"
)

// ExportMyData returns everything Flowie stores about the caller as a single
// JSON download (GDPR art. 15 & 20 — right of access / data portability).
func (h *Handlers) ExportMyData(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserID(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthenticated", "")
		return
	}
	bundle, err := h.Store.Users.ExportData(r.Context(), userID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "export_failed", err.Error())
		return
	}
	h.audit(r, store.AuditDataExported, "self", nil, nil)
	filename := fmt.Sprintf("flowie-export-%s.json", time.Now().Format("2006-01-02"))
	w.Header().Set("Content-Disposition", `attachment; filename="`+filename+`"`)
	httpx.JSON(w, http.StatusOK, bundle)
}

type deleteAccountRequest struct {
	// Confirm must equal the caller's email — a deliberate speed bump against
	// accidental deletion.
	Confirm string `json:"confirm"`
}

// DeleteMyData anonymises the caller's account (GDPR art. 17 — erasure).
//
// Rows the team still needs (tasks, comments, worklogs) keep their history but
// lose the link to the person; the user record itself is scrubbed and
// deactivated rather than hard-deleted, so foreign keys and audit trails stay
// intact.
func (h *Handlers) DeleteMyData(w http.ResponseWriter, r *http.Request) {
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
	var req deleteAccountRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	if !strings.EqualFold(strings.TrimSpace(req.Confirm), user.Email) {
		httpx.Error(w, http.StatusBadRequest, "confirm_mismatch",
			"nhập đúng email của bạn để xác nhận xoá tài khoản")
		return
	}

	// Recorded before erasure so the actor's email is still resolvable.
	h.auditFor(r, userID, user.Email, store.AuditAccountErased, "self", nil)
	if err := h.Store.Users.AnonymiseAccount(r.Context(), userID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "delete_failed", err.Error())
		return
	}
	h.Sessions.ClearCookie(w)
	httpx.JSON(w, http.StatusOK, map[string]any{"deleted": true})
}
