package sharepoint

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// SimpleUploadLimit is the size above which Graph requires an upload session.
// Microsoft documents 4 MB as the ceiling for a plain PUT.
const SimpleUploadLimit = 4 << 20

// chunkSize must be a multiple of 320 KiB per the Graph API contract.
const chunkSize = 5 * 320 * 1024 // 1.6 MiB

// uploadSession is the Graph response that starts a resumable upload.
type uploadSession struct {
	UploadURL string `json:"uploadUrl"`
}

// chunkRange describes one slice of the file to send.
type chunkRange struct {
	Start int64
	End   int64 // inclusive, as Content-Range requires
}

// planChunks splits a file size into Content-Range slices.
//
// Kept separate from the network code so the arithmetic — the part that is easy
// to get wrong by one byte — can be unit tested without Graph.
func planChunks(size int64, chunk int64) []chunkRange {
	if size <= 0 {
		return nil
	}
	if chunk <= 0 {
		chunk = chunkSize
	}
	var out []chunkRange
	for start := int64(0); start < size; start += chunk {
		end := start + chunk - 1
		if end >= size {
			end = size - 1
		}
		out = append(out, chunkRange{Start: start, End: end})
	}
	return out
}

// UploadLargeFile uploads a file of any size, using a resumable upload session
// when the content exceeds the simple-PUT limit.
func (c *Client) UploadLargeFile(ctx context.Context, rel string, content []byte) (*DriveItem, error) {
	if len(content) <= SimpleUploadLimit {
		return c.UploadFile(ctx, rel, content)
	}
	if err := c.resolve(ctx); err != nil {
		return nil, err
	}

	// 1. Ask Graph for an upload URL.
	sessPath := "/drives/" + c.driveID + "/root:/" + itemPath(rel) + ":/createUploadSession"
	reqBody := strings.NewReader(`{"item":{"@microsoft.graph.conflictBehavior":"replace"}}`)
	var sess uploadSession
	if err := c.doJSON(ctx, http.MethodPost, sessPath, reqBody, "application/json", &sess); err != nil {
		return nil, fmt.Errorf("create upload session: %w", err)
	}
	if sess.UploadURL == "" {
		return nil, fmt.Errorf("graph returned an empty upload url")
	}

	// 2. PUT each chunk to the session URL. The session URL is pre-authorised,
	// so these requests deliberately carry no bearer token.
	size := int64(len(content))
	var item DriveItem
	for _, ch := range planChunks(size, chunkSize) {
		part := content[ch.Start : ch.End+1]
		req, err := http.NewRequestWithContext(ctx, http.MethodPut, sess.UploadURL, bytes.NewReader(part))
		if err != nil {
			return nil, err
		}
		req.Header.Set("Content-Length", fmt.Sprint(len(part)))
		req.Header.Set("Content-Range",
			fmt.Sprintf("bytes %d-%d/%d", ch.Start, ch.End, size))

		resp, err := c.http.Do(req)
		if err != nil {
			return nil, fmt.Errorf("upload chunk %d-%d: %w", ch.Start, ch.End, err)
		}
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
		resp.Body.Close()

		switch {
		case resp.StatusCode == http.StatusAccepted:
			// More chunks expected; keep going.
		case resp.StatusCode == http.StatusOK || resp.StatusCode == http.StatusCreated:
			// Final chunk returns the created DriveItem.
			if err := json.Unmarshal(body, &item); err != nil {
				return nil, fmt.Errorf("parse final chunk response: %w", err)
			}
		default:
			return nil, fmt.Errorf("upload chunk %d-%d failed: %s: %s",
				ch.Start, ch.End, resp.Status, string(body))
		}
	}
	if item.ID == "" {
		return nil, fmt.Errorf("upload finished without a drive item")
	}
	return &item, nil
}
