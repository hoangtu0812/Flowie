package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/flowie/backend/internal/auth"
	"github.com/flowie/backend/internal/domain"
	"github.com/flowie/backend/internal/httpx"
	"github.com/google/uuid"
)

var validFieldTypes = map[string]bool{
	"text": true, "number": true, "dropdown": true, "date": true, "url": true,
}

// ListCustomFields returns a project's custom field definitions.
func (h *Handlers) ListCustomFields(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	proj, _, ok := h.requireProjectAccess(w, r, userID)
	if !ok {
		return
	}
	defs, err := h.Store.Tasks.ListCustomFieldDefs(r.Context(), proj.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "list_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"fields": defs})
}

type createCustomFieldRequest struct {
	Name      string          `json:"name"`
	FieldType string          `json:"fieldType"`
	Options   json.RawMessage `json:"options"`
}

// CreateCustomField adds a field definition to a project.
func (h *Handlers) CreateCustomField(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	proj, role, ok := h.requireProjectAccess(w, r, userID)
	if !ok {
		return
	}
	if role == domain.WorkspaceRoleGuest {
		httpx.Error(w, http.StatusForbidden, "forbidden", "guests cannot manage custom fields")
		return
	}
	var req createCustomFieldRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		httpx.Error(w, http.StatusBadRequest, "validation", "name is required")
		return
	}
	if !validFieldTypes[req.FieldType] {
		httpx.Error(w, http.StatusBadRequest, "validation", "fieldType must be one of text, number, dropdown, date, url")
		return
	}
	def, err := h.Store.Tasks.CreateCustomFieldDef(r.Context(), proj.ID, req.Name, req.FieldType, req.Options)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "create_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, def)
}

// DeleteCustomField removes a project field definition (and its values via cascade).
func (h *Handlers) DeleteCustomField(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	proj, role, ok := h.requireProjectAccess(w, r, userID)
	if !ok {
		return
	}
	if role == domain.WorkspaceRoleGuest {
		httpx.Error(w, http.StatusForbidden, "forbidden", "guests cannot manage custom fields")
		return
	}
	fieldID, ok := parseUUIDParam(w, r, "fieldID")
	if !ok {
		return
	}
	if err := h.Store.Tasks.DeleteCustomFieldDef(r.Context(), proj.ID, fieldID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "delete_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

type setCustomFieldValueRequest struct {
	FieldID uuid.UUID       `json:"fieldId"`
	Value   json.RawMessage `json:"value"`
}

// isEmptyJSON reports whether a raw value should clear the field (null/""/absent).
func isEmptyJSON(v json.RawMessage) bool {
	t := bytes.TrimSpace(v)
	return len(t) == 0 || bytes.Equal(t, []byte("null")) || bytes.Equal(t, []byte(`""`))
}

// SetTaskCustomField sets or clears a task's value for a custom field.
func (h *Handlers) SetTaskCustomField(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	task, role, ok := h.requireTaskAccess(w, r, userID)
	if !ok {
		return
	}
	if role == domain.WorkspaceRoleGuest {
		httpx.Error(w, http.StatusForbidden, "forbidden", "guests cannot edit tasks")
		return
	}
	var req setCustomFieldValueRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	if req.FieldID == uuid.Nil {
		httpx.Error(w, http.StatusBadRequest, "validation", "fieldId is required")
		return
	}
	if isEmptyJSON(req.Value) {
		if err := h.Store.Tasks.ClearCustomFieldValue(r.Context(), task.ID, req.FieldID); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "update_failed", err.Error())
			return
		}
	} else if err := h.Store.Tasks.SetCustomFieldValue(r.Context(), task.ID, req.FieldID, req.Value); err != nil {
		httpx.Error(w, http.StatusBadRequest, "update_failed", "field not found in this project")
		return
	}
	values, err := h.Store.Tasks.ListCustomFieldValues(r.Context(), task.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "list_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"customFields": values})
}
