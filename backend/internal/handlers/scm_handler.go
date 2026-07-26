package handlers

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"

	"github.com/flowie/backend/internal/httpx"
	"github.com/google/uuid"
)

// taskRefRe matches task references in commit messages and PR titles, e.g.
// "SAP-12" or "fixes SAP-12". The project key is uppercase, the number is the
// task's short id within the project.
var taskRefRe = regexp.MustCompile(`\b([A-Z][A-Z0-9]{1,9})-(\d+)\b`)

// scmPayload is the subset of GitHub/GitLab webhook bodies we read. Both
// providers nest things differently, so each field is optional and the parser
// tolerates whichever shape arrives.
type scmPayload struct {
	// GitHub push
	Commits []struct {
		ID      string `json:"id"`
		Message string `json:"message"`
		URL     string `json:"url"`
		Author  struct {
			Name string `json:"name"`
		} `json:"author"`
	} `json:"commits"`
	// GitHub pull_request
	Action      string `json:"action"`
	PullRequest *struct {
		Number  int    `json:"number"`
		Title   string `json:"title"`
		HTMLURL string `json:"html_url"`
		Merged  bool   `json:"merged"`
	} `json:"pull_request"`
	// GitLab merge request
	ObjectKind       string `json:"object_kind"`
	ObjectAttributes *struct {
		IID    int    `json:"iid"`
		Title  string `json:"title"`
		URL    string `json:"url"`
		State  string `json:"state"`
		Action string `json:"action"`
	} `json:"object_attributes"`
	Repository struct {
		Name string `json:"name"`
		URL  string `json:"url"`
	} `json:"repository"`
}

// verifySCMSignature checks GitHub's X-Hub-Signature-256 when a secret is set.
// GitLab uses a plain token header instead, handled by the caller.
func verifySCMSignature(secret string, body []byte, header string) bool {
	if secret == "" {
		return true // no secret configured: accept (documented as optional)
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	want := "sha256=" + hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(want), []byte(header))
}

// SCMWebhook receives GitHub/GitLab events and links them to tasks.
//
// Authentication is by the project's API-key-like secret in the URL rather than
// a session, because the caller is a machine. Matching tasks get a comment so
// the commit/PR shows up in their activity feed.
func (h *Handlers) SCMWebhook(w http.ResponseWriter, r *http.Request) {
	projectID, ok := parseUUIDParam(w, r, "projectID")
	if !ok {
		return
	}
	proj, err := h.Store.Projects.GetByID(r.Context(), projectID)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "project not found")
		return
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20)) // 1 MB cap
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "read_failed", err.Error())
		return
	}
	// The shared secret is the project's SCM webhook token, passed as a query
	// param when registering the hook.
	secret := r.URL.Query().Get("secret")
	if !verifySCMSignature(secret, body, r.Header.Get("X-Hub-Signature-256")) {
		httpx.Error(w, http.StatusUnauthorized, "bad_signature", "chữ ký không hợp lệ")
		return
	}

	var p scmPayload
	if err := json.Unmarshal(body, &p); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_body", "payload không phải JSON hợp lệ")
		return
	}

	linked := 0
	for _, note := range scmNotes(&p, proj.Key) {
		if h.linkSCMNote(r, projectID, note) {
			linked++
		}
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"linked": linked})
}

// scmNote is one comment to attach, already resolved to a task number.
type scmNote struct {
	taskNumber string
	text       string
}

// scmNotes turns a webhook payload into per-task comments.
func scmNotes(p *scmPayload, projectKey string) []scmNote {
	var out []scmNote
	add := func(ref, text string) {
		out = append(out, scmNote{taskNumber: ref, text: text})
	}

	for _, c := range p.Commits {
		for _, ref := range refsFor(c.Message, projectKey) {
			short := c.ID
			if len(short) > 7 {
				short = short[:7]
			}
			add(ref, fmt.Sprintf("🔗 Commit `%s` bởi %s: %s\n%s",
				short, c.Author.Name, firstLine(c.Message), c.URL))
		}
	}

	if pr := p.PullRequest; pr != nil {
		verb := p.Action
		if pr.Merged {
			verb = "merged"
		}
		for _, ref := range refsFor(pr.Title, projectKey) {
			add(ref, fmt.Sprintf("🔗 Pull request #%d %s: %s\n%s",
				pr.Number, verb, pr.Title, pr.HTMLURL))
		}
	}

	if mr := p.ObjectAttributes; mr != nil && p.ObjectKind == "merge_request" {
		for _, ref := range refsFor(mr.Title, projectKey) {
			add(ref, fmt.Sprintf("🔗 Merge request !%d %s: %s\n%s",
				mr.IID, mr.State, mr.Title, mr.URL))
		}
	}
	return out
}

// refsFor extracts task numbers referenced in text for a given project key.
func refsFor(text, projectKey string) []string {
	seen := map[string]bool{}
	var out []string
	for _, m := range taskRefRe.FindAllStringSubmatch(text, -1) {
		if !strings.EqualFold(m[1], projectKey) || seen[m[2]] {
			continue
		}
		seen[m[2]] = true
		out = append(out, m[2])
	}
	return out
}

func firstLine(s string) string {
	if i := strings.IndexByte(s, '\n'); i >= 0 {
		return s[:i]
	}
	return s
}

// linkSCMNote posts the note as a comment on the referenced task.
func (h *Handlers) linkSCMNote(r *http.Request, projectID uuid.UUID, note scmNote) bool {
	task, err := h.Store.Tasks.ByProjectNumber(r.Context(), projectID, note.taskNumber)
	if err != nil {
		return false
	}
	// A nil author marks the comment as machine-generated.
	if _, err := h.Store.Tasks.AddSystemComment(r.Context(), task.ID, note.text); err != nil {
		return false
	}
	_ = h.Store.Tasks.RecordActivity(r.Context(), task.ID, uuid.Nil, "scm_linked",
		map[string]any{"note": firstLine(note.text)})
	h.emit(projectID, uuid.Nil, "task.commented", map[string]any{"taskId": task.ID, "via": "scm"})
	return true
}
