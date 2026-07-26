package handlers

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"path"
	"regexp"
	"strings"

	"github.com/flowie/backend/internal/auth"
	"github.com/flowie/backend/internal/domain"
	"github.com/flowie/backend/internal/httpx"
	"github.com/flowie/backend/internal/store"
)

// maxAttachmentBytes caps a single upload. Chunked upload handles the size;
// this limit exists to protect memory, since the file is buffered before being
// forwarded to Graph.
const maxAttachmentBytes = 100 << 20 // 100 MB

// unsafeFileChars strips characters SharePoint rejects in file names.
var unsafeFileChars = regexp.MustCompile(`[\\/:*?"<>|#%]`)

// safeFileName makes a user-supplied name safe for SharePoint.
//
// Browsers on Windows may send a full path like `C:\dir\file.txt`; path.Base
// only understands forward slashes, so backslashes are normalised first —
// otherwise the directory part survives into the stored file name.
func safeFileName(name string) string {
	name = strings.ReplaceAll(strings.TrimSpace(name), `\`, "/")
	name = path.Base(name)
	name = unsafeFileChars.ReplaceAllString(name, "_")
	name = strings.TrimLeft(name, ".") // no hidden/relative names
	if name == "" {
		name = "file"
	}
	if len(name) > 180 {
		ext := path.Ext(name)
		name = name[:180-len(ext)] + ext
	}
	return name
}

// attachmentFolder is where a task's files live inside the project folder.
func attachmentFolder(projectFolder, taskRef string) string {
	base := strings.Trim(projectFolder, "/")
	if base == "" {
		base = "Projects"
	}
	return fmt.Sprintf("%s/04_Tasks/%s", base, taskRef)
}

// BrowseProjectFiles lists the contents of a folder inside the project's
// SharePoint tree, so users can see documents that were not attached to a task.
//
// The requested sub-path is confined to the project folder: a caller cannot
// walk up into another project's documents.
func (h *Handlers) BrowseProjectFiles(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	proj, _, ok := h.requireProjectAccess(w, r, userID)
	if !ok {
		return
	}
	if h.SharePoint == nil {
		httpx.Error(w, http.StatusServiceUnavailable, "storage_unavailable",
			"SharePoint chưa được cấu hình")
		return
	}

	root := strings.Trim(proj.SharePointFolderPath, "/")
	if root == "" {
		httpx.Error(w, http.StatusConflict, "no_folder",
			"dự án chưa có thư mục SharePoint")
		return
	}
	sub := path.Clean("/" + strings.Trim(r.URL.Query().Get("path"), "/"))
	// path.Clean resolves any "..", so the result can only be inside the root.
	target := strings.TrimSuffix(root+sub, "/")

	items, err := h.SharePoint.ListFolder(r.Context(), target)
	if err != nil {
		httpx.Error(w, http.StatusBadGateway, "browse_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{
		"root":  root,
		"path":  strings.TrimPrefix(sub, "/"),
		"items": items,
	})
}

// ListAttachments returns a task's files.
func (h *Handlers) ListAttachments(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	task, _, ok := h.requireTaskAccess(w, r, userID)
	if !ok {
		return
	}
	list, err := h.Store.Attachments.ListByTask(r.Context(), task.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "list_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"attachments": list})
}

// UploadAttachment stores a file in SharePoint and links it to the task.
func (h *Handlers) UploadAttachment(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	task, role, ok := h.requireTaskAccess(w, r, userID)
	if !ok {
		return
	}
	if role == domain.WorkspaceRoleGuest {
		httpx.Error(w, http.StatusForbidden, "forbidden", "guests cannot upload files")
		return
	}
	if h.SharePoint == nil {
		httpx.Error(w, http.StatusServiceUnavailable, "storage_unavailable",
			"SharePoint chưa được cấu hình")
		return
	}

	if err := r.ParseMultipartForm(8 << 20); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_form", err.Error())
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "missing_file", "thiếu trường 'file'")
		return
	}
	defer file.Close()

	if header.Size > maxAttachmentBytes {
		httpx.Error(w, http.StatusRequestEntityTooLarge, "file_too_large",
			fmt.Sprintf("tối đa %d MB", maxAttachmentBytes>>20))
		return
	}
	content, err := io.ReadAll(io.LimitReader(file, maxAttachmentBytes+1))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "read_failed", err.Error())
		return
	}
	if int64(len(content)) > maxAttachmentBytes {
		httpx.Error(w, http.StatusRequestEntityTooLarge, "file_too_large", "file quá lớn")
		return
	}

	proj, err := h.Store.Projects.GetByID(r.Context(), task.ProjectID)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "project not found")
		return
	}
	taskRef := proj.Key
	if task.Number != nil {
		taskRef = fmt.Sprintf("%s-%d", proj.Key, *task.Number)
	}
	folder := attachmentFolder(proj.SharePointFolderPath, taskRef)
	name := safeFileName(header.Filename)

	if _, err := h.SharePoint.EnsureFolder(r.Context(), folder); err != nil {
		httpx.Error(w, http.StatusBadGateway, "folder_failed", err.Error())
		return
	}
	// Chunked upload kicks in automatically past the 4 MB Graph limit.
	item, err := h.SharePoint.UploadLargeFile(r.Context(), folder+"/"+name, content)
	if err != nil {
		httpx.Error(w, http.StatusBadGateway, "upload_failed", err.Error())
		return
	}

	saved, err := h.Store.Attachments.Create(r.Context(), domain.Attachment{
		TaskID:      task.ID,
		UploadedBy:  &userID,
		Name:        name,
		SizeBytes:   int64(len(content)),
		ContentType: header.Header.Get("Content-Type"),
		DriveItemID: item.ID,
		WebURL:      item.WebURL,
		FolderPath:  folder,
	})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "save_failed", err.Error())
		return
	}
	_ = h.Store.Tasks.RecordActivity(r.Context(), task.ID, userID, "attachment_added",
		map[string]any{"name": name})
	h.emit(task.ProjectID, userID, "task.updated", map[string]any{"taskId": task.ID})
	httpx.JSON(w, http.StatusCreated, saved)
}

// DeleteAttachment unlinks a file from the task. The SharePoint copy is left in
// place on purpose: the folder is the team's document store and deleting there
// would be a destructive side effect of a Flowie-only action.
func (h *Handlers) DeleteAttachment(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	task, role, ok := h.requireTaskAccess(w, r, userID)
	if !ok {
		return
	}
	if role == domain.WorkspaceRoleGuest {
		httpx.Error(w, http.StatusForbidden, "forbidden", "guests cannot remove files")
		return
	}
	id, ok := parseUUIDParam(w, r, "attachmentID")
	if !ok {
		return
	}
	if err := h.Store.Attachments.Delete(r.Context(), task.ID, id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "attachment not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "delete_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
}
