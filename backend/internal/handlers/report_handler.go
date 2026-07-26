package handlers

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/flowie/backend/internal/auth"
	"github.com/flowie/backend/internal/domain"
	"github.com/flowie/backend/internal/httpx"
	"github.com/flowie/backend/internal/store"
	"github.com/google/uuid"
)

// buildReportText renders the summary posted to chat.
func (h *Handlers) buildReportText(ctx context.Context, rep domain.ScheduledReport) (string, error) {
	// Digests quote headline counters, not the chart, so the trend range is
	// irrelevant here — ask for the cheapest one.
	ov, err := h.Store.Tasks.WorkspaceOverview(ctx, rep.WorkspaceID, store.TrendRange{Unit: "month", Count: 1})
	if err != nil {
		return "", err
	}
	period := "Hôm nay"
	if rep.Frequency == "weekly" {
		period = "Tuần này"
	}

	var b strings.Builder
	fmt.Fprintf(&b, "*%s · %s*\n", rep.Name, period)
	fmt.Fprintf(&b, "• Tổng công việc: %d (hoàn thành %d)\n", ov.TotalTasks, ov.DoneTasks)
	fmt.Fprintf(&b, "• Đang làm: %d · Chưa bắt đầu: %d\n", ov.InProgressTask, ov.BacklogTasks)
	if ov.OverdueTasks > 0 {
		fmt.Fprintf(&b, "• ⚠️ Quá hạn: %d\n", ov.OverdueTasks)
	}
	fmt.Fprintf(&b, "• Giờ đã log: %.1fh\n", ov.HoursLogged)

	// Per-project lines make the digest actionable rather than just a total.
	if len(ov.Projects) > 0 {
		b.WriteString("\n*Theo dự án*\n")
		for _, p := range ov.Projects {
			if rep.ProjectID != nil && p.ProjectID != *rep.ProjectID {
				continue
			}
			pct := 0
			if p.Total > 0 {
				pct = p.Done * 100 / p.Total
			}
			fmt.Fprintf(&b, "• %s: %d/%d (%d%%)", p.Key, p.Done, p.Total, pct)
			if p.Overdue > 0 {
				fmt.Fprintf(&b, " · quá hạn %d", p.Overdue)
			}
			b.WriteString("\n")
		}
	}
	return b.String(), nil
}

// sendReport posts one report to its channel and records the outcome.
func (h *Handlers) sendReport(ctx context.Context, rep domain.ScheduledReport) {
	text, err := h.buildReportText(ctx, rep)
	if err != nil {
		h.Store.Reports.MarkRun(ctx, rep.ID, 0, err.Error())
		return
	}
	body, err := chatPayload(rep.Provider, text)
	if err != nil {
		h.Store.Reports.MarkRun(ctx, rep.ID, 0, err.Error())
		return
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, rep.ChannelURL, bytes.NewReader(body))
	if err != nil {
		h.Store.Reports.MarkRun(ctx, rep.ID, 0, err.Error())
		return
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := webhookClient.Do(req)
	if err != nil {
		h.Store.Reports.MarkRun(ctx, rep.ID, 0, err.Error())
		return
	}
	resp.Body.Close()
	msg := ""
	if resp.StatusCode >= 300 {
		msg = "non-2xx response"
	}
	h.Store.Reports.MarkRun(ctx, rep.ID, resp.StatusCode, msg)
}

// StartReportScheduler runs the digest loop until ctx is cancelled.
//
// It ticks every 10 minutes and asks the store which reports are due for the
// current UTC hour. The "already ran this period" check lives in the query, so
// a restart (or several app instances) cannot double-send.
func (h *Handlers) StartReportScheduler(ctx context.Context) {
	go func() {
		ticker := time.NewTicker(10 * time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				hour := time.Now().UTC().Hour()
				due, err := h.Store.Reports.DueNow(ctx, hour)
				if err != nil {
					slog.Warn("report scheduler query failed", "err", err)
					continue
				}
				for _, rep := range due {
					h.sendReport(ctx, rep)
				}
			}
		}
	}()
}

// ListReports returns a workspace's scheduled reports.
func (h *Handlers) ListReports(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	ws, ok := h.requireWorkspaceManager(w, r, userID)
	if !ok {
		return
	}
	list, err := h.Store.Reports.ListByWorkspace(r.Context(), ws.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "list_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"reports": list})
}

type createReportRequest struct {
	Name       string     `json:"name"`
	ProjectID  *uuid.UUID `json:"projectId"`
	Frequency  string     `json:"frequency"`
	ChannelURL string     `json:"channelUrl"`
	Provider   string     `json:"provider"`
	HourUTC    int        `json:"hourUtc"`
}

// CreateReport schedules a recurring digest.
func (h *Handlers) CreateReport(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	ws, ok := h.requireWorkspaceManager(w, r, userID)
	if !ok {
		return
	}
	var req createReportRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		httpx.Error(w, http.StatusBadRequest, "validation", "name is required")
		return
	}
	if req.Frequency != "daily" && req.Frequency != "weekly" {
		req.Frequency = "weekly"
	}
	if req.Provider == "" {
		req.Provider = "slack"
	}
	if !validProviders[req.Provider] {
		httpx.Error(w, http.StatusBadRequest, "validation", "provider must be slack or teams")
		return
	}
	u, err := url.Parse(strings.TrimSpace(req.ChannelURL))
	if err != nil || u.Scheme != "https" || u.Host == "" {
		httpx.Error(w, http.StatusBadRequest, "validation", "channelUrl phải là URL https hợp lệ")
		return
	}
	if req.HourUTC < 0 || req.HourUTC > 23 {
		httpx.Error(w, http.StatusBadRequest, "validation", "hourUtc phải trong khoảng 0–23")
		return
	}

	rep, err := h.Store.Reports.Create(r.Context(), ws.ID, req.ProjectID, req.Name,
		req.Frequency, u.String(), req.Provider, req.HourUTC)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "create_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, rep)
}

// DeleteReport removes a scheduled report.
func (h *Handlers) DeleteReport(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	ws, ok := h.requireWorkspaceManager(w, r, userID)
	if !ok {
		return
	}
	id, ok := parseUUIDParam(w, r, "reportID")
	if !ok {
		return
	}
	if err := h.Store.Reports.Delete(r.Context(), ws.ID, id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "report not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "delete_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

// RunReportNow sends a report immediately, for testing the channel setup.
func (h *Handlers) RunReportNow(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	ws, ok := h.requireWorkspaceManager(w, r, userID)
	if !ok {
		return
	}
	id, ok := parseUUIDParam(w, r, "reportID")
	if !ok {
		return
	}
	list, err := h.Store.Reports.ListByWorkspace(r.Context(), ws.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "lookup_failed", err.Error())
		return
	}
	for _, rep := range list {
		if rep.ID == id {
			h.sendReport(r.Context(), rep)
			httpx.JSON(w, http.StatusOK, map[string]any{"sent": true})
			return
		}
	}
	httpx.Error(w, http.StatusNotFound, "not_found", "report not found")
}
