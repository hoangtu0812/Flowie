package handlers

import (
	"net/http"

	"github.com/flowie/backend/internal/httpx"
)

// Health reports service liveness and feature configuration status.
func (h *Handlers) Health(w http.ResponseWriter, r *http.Request) {
	httpx.JSON(w, http.StatusOK, map[string]any{
		"status": "ok",
		"features": map[string]bool{
			"azureAD":    h.Azure != nil,
			"sharePoint": h.SharePoint != nil,
		},
	})
}
