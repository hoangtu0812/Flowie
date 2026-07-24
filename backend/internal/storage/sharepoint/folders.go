package sharepoint

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

// DriveItem is a minimal representation of a Graph driveItem.
type DriveItem struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	WebURL string `json:"webUrl"`
	Folder *struct {
		ChildCount int `json:"childCount"`
	} `json:"folder,omitempty"`
	Size int64 `json:"size"`
}

// itemPath escapes a drive-relative path for use in a Graph addressing segment.
func itemPath(rel string) string {
	rel = strings.Trim(rel, "/")
	parts := strings.Split(rel, "/")
	for i, p := range parts {
		parts[i] = url.PathEscape(p)
	}
	return strings.Join(parts, "/")
}

// getItem fetches a driveItem by drive-relative path, or nil if it doesn't exist.
func (c *Client) getItem(ctx context.Context, rel string) (*DriveItem, bool, error) {
	if rel == "" {
		var root DriveItem
		if err := c.doJSON(ctx, http.MethodGet, "/drives/"+c.driveID+"/root", nil, "", &root); err != nil {
			return nil, false, err
		}
		return &root, true, nil
	}
	var item DriveItem
	err := c.doJSON(ctx, http.MethodGet, "/drives/"+c.driveID+"/root:/"+itemPath(rel), nil, "", &item)
	if err != nil {
		if strings.Contains(err.Error(), "(404)") {
			return nil, false, nil
		}
		return nil, false, err
	}
	return &item, true, nil
}

// createFolder creates a single folder named child under parentRel (drive-relative).
func (c *Client) createFolder(ctx context.Context, parentRel, child string) (*DriveItem, error) {
	payload := map[string]any{
		"name":                              child,
		"folder":                            map[string]any{},
		"@microsoft.graph.conflictBehavior": "replace", // idempotent-ish; keeps existing
	}
	buf, _ := json.Marshal(payload)

	var childrenPath string
	if parentRel == "" {
		childrenPath = "/drives/" + c.driveID + "/root/children"
	} else {
		childrenPath = "/drives/" + c.driveID + "/root:/" + itemPath(parentRel) + ":/children"
	}
	var item DriveItem
	if err := c.doJSON(ctx, http.MethodPost, childrenPath, bytes.NewReader(buf), "application/json", &item); err != nil {
		return nil, err
	}
	return &item, nil
}

// EnsureFolder makes sure every segment of the given drive-relative path exists,
// creating missing folders. It returns the final folder's driveItem. This is the
// core of Flowie's "auto-create subfolder structure" behaviour.
func (c *Client) EnsureFolder(ctx context.Context, rel string) (*DriveItem, error) {
	if err := c.resolve(ctx); err != nil {
		return nil, err
	}
	rel = strings.Trim(rel, "/")
	if rel == "" {
		item, _, err := c.getItem(ctx, "")
		return item, err
	}

	segments := strings.Split(rel, "/")
	var built string
	var last *DriveItem
	for _, seg := range segments {
		seg = strings.TrimSpace(seg)
		if seg == "" {
			continue
		}
		next := seg
		if built != "" {
			next = built + "/" + seg
		}
		item, exists, err := c.getItem(ctx, next)
		if err != nil {
			return nil, err
		}
		if !exists {
			item, err = c.createFolder(ctx, built, seg)
			if err != nil {
				return nil, fmt.Errorf("create folder %q: %w", next, err)
			}
		}
		last = item
		built = next
	}
	return last, nil
}

// RootFolder returns the configured root folder (drive-relative, no leading slash).
func (c *Client) RootFolder() string { return c.rootFolder }

// UploadFile uploads (or replaces) a small file at the given drive-relative path.
// For files under ~4MB this simple PUT is sufficient; large files need an upload
// session (added later).
func (c *Client) UploadFile(ctx context.Context, rel string, content []byte) (*DriveItem, error) {
	if err := c.resolve(ctx); err != nil {
		return nil, err
	}
	path := "/drives/" + c.driveID + "/root:/" + itemPath(rel) + ":/content"
	var item DriveItem
	if err := c.doJSON(ctx, http.MethodPut, path, bytes.NewReader(content), "application/octet-stream", &item); err != nil {
		return nil, err
	}
	return &item, nil
}

// ListFolder returns the children of a drive-relative folder path.
func (c *Client) ListFolder(ctx context.Context, rel string) ([]DriveItem, error) {
	if err := c.resolve(ctx); err != nil {
		return nil, err
	}
	var listPath string
	if strings.Trim(rel, "/") == "" {
		listPath = "/drives/" + c.driveID + "/root/children"
	} else {
		listPath = "/drives/" + c.driveID + "/root:/" + itemPath(rel) + ":/children"
	}
	var out struct {
		Value []DriveItem `json:"value"`
	}
	if err := c.doJSON(ctx, http.MethodGet, listPath, nil, "", &out); err != nil {
		return nil, err
	}
	return out.Value, nil
}
