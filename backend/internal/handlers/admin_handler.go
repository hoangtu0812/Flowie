package handlers

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strings"

	"github.com/flowie/backend/internal/auth"
	"github.com/flowie/backend/internal/httpx"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// requireAdmin checks if the current user is a system admin.
func (h *Handlers) requireAdmin(w http.ResponseWriter, r *http.Request) bool {
	userID, ok := auth.UserID(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthenticated", "")
		return false
	}
	user, err := h.Store.Users.GetByID(r.Context(), userID)
	if err != nil || !user.IsSystemAdmin {
		httpx.Error(w, http.StatusForbidden, "forbidden", "requires system admin")
		return false
	}
	return true
}

func (h *Handlers) AdminListUsers(w http.ResponseWriter, r *http.Request) {
	if !h.requireAdmin(w, r) {
		return
	}
	users, err := h.Store.Users.ListAll(r.Context())
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "db_error", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, users)
}

func (h *Handlers) AdminToggleUser(w http.ResponseWriter, r *http.Request) {
	if !h.requireAdmin(w, r) {
		return
	}
	idStr := chi.URLParam(r, "userID")
	id, err := uuid.Parse(idStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_id", err.Error())
		return
	}

	var payload struct {
		IsSystemAdmin bool `json:"isSystemAdmin"`
	}
	if err := httpx.Decode(r, &payload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}

	err = h.Store.Users.SetSystemAdmin(r.Context(), id, payload.IsSystemAdmin)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "db_error", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handlers) AdminListWorkspaces(w http.ResponseWriter, r *http.Request) {
	if !h.requireAdmin(w, r) {
		return
	}
	ws, err := h.Store.Workspaces.ListAll(r.Context())
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "db_error", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, ws)
}

func (h *Handlers) AdminCreateWorkspace(w http.ResponseWriter, r *http.Request) {
	if !h.requireAdmin(w, r) {
		return
	}
	var payload struct {
		Name  string    `json:"name"`
		Owner uuid.UUID `json:"owner_id"`
	}
	if err := httpx.Decode(r, &payload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	slug := strings.ToLower(strings.ReplaceAll(strings.TrimSpace(payload.Name), " ", "-"))
	ws, err := h.Store.Workspaces.Create(r.Context(), payload.Name, slug, payload.Owner)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "db_error", err.Error())
		return
	}

	httpx.JSON(w, http.StatusCreated, ws)
}

func (h *Handlers) AdminDeleteWorkspace(w http.ResponseWriter, r *http.Request) {
	if !h.requireAdmin(w, r) {
		return
	}
	idStr := chi.URLParam(r, "workspaceID")
	id, err := uuid.Parse(idStr)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_id", err.Error())
		return
	}

	err = h.Store.Workspaces.Delete(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "db_error", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handlers) AdminSyncAzureUsers(w http.ResponseWriter, r *http.Request) {
	if !h.requireAdmin(w, r) {
		return
	}
	if !h.Cfg.Azure.Configured() {
		httpx.Error(w, http.StatusServiceUnavailable, "no_azure", "Azure AD not configured")
		return
	}

	// 1. Get Graph App-only Token
	tokenURL := "https://login.microsoftonline.com/" + h.Cfg.Azure.TenantID + "/oauth2/v2.0/token"
	form := url.Values{
		"client_id":     {h.Cfg.Azure.ClientID},
		"client_secret": {h.Cfg.Azure.ClientSecret},
		"scope":         {"https://graph.microsoft.com/.default"},
		"grant_type":    {"client_credentials"},
	}
	req, _ := http.NewRequestWithContext(r.Context(), "POST", tokenURL, strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := http.DefaultClient.Do(req)
	if err != nil || resp.StatusCode != http.StatusOK {
		httpx.Error(w, http.StatusInternalServerError, "graph_auth_error", "Failed to get token from Azure")
		return
	}
	defer resp.Body.Close()
	var tr struct {
		AccessToken string `json:"access_token"`
	}
	json.NewDecoder(resp.Body).Decode(&tr)

	// 2. List Users from Graph with Pagination
	nextLink := "https://graph.microsoft.com/v1.0/users?$select=id,displayName,userPrincipalName,mail"
	count := 0

	for nextLink != "" {
		req2, _ := http.NewRequestWithContext(r.Context(), "GET", nextLink, nil)
		req2.Header.Set("Authorization", "Bearer "+tr.AccessToken)
		resp2, err := http.DefaultClient.Do(req2)
		if err != nil || resp2.StatusCode != http.StatusOK {
			httpx.Error(w, http.StatusInternalServerError, "graph_api_error", "Failed to fetch users from Graph")
			return
		}

		var graphRes struct {
			Value []struct {
				ID                string `json:"id"`
				DisplayName       string `json:"displayName"`
				UserPrincipalName string `json:"userPrincipalName"`
				Mail              string `json:"mail"`
			} `json:"value"`
			ODataNextLink string `json:"@odata.nextLink"`
		}
		json.NewDecoder(resp2.Body).Decode(&graphRes)
		resp2.Body.Close()

		for _, gu := range graphRes.Value {
			email := gu.Mail
			if email == "" {
				email = gu.UserPrincipalName
			}
			if email == "" || gu.ID == "" {
				continue
			}

			isAdmin := false
			for _, e := range h.Cfg.SystemAdminEmails {
				if strings.EqualFold(e, email) {
					isAdmin = true
					break
				}
			}

			// Don't fetch picture here to avoid rate limits on 100+ users.
			_, err := h.Store.Users.UpsertFromAzure(r.Context(), gu.ID, email, gu.DisplayName, "", isAdmin)
			if err == nil {
				count++
			}
		}

		nextLink = graphRes.ODataNextLink
	}

	httpx.JSON(w, http.StatusOK, map[string]int{"synced": count})
}
