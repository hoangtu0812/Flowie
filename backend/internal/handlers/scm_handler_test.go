package handlers

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"strings"
	"testing"
)

func TestRefsForMatchesOnlyItsProject(t *testing.T) {
	cases := []struct {
		text string
		key  string
		want []string
	}{
		{"fix login SAP-12", "SAP", []string{"12"}},
		{"SAP-1 and SAP-2 in one commit", "SAP", []string{"1", "2"}},
		{"duplicate SAP-7 SAP-7", "SAP", []string{"7"}}, // de-duplicated
		{"belongs to WEB-3", "SAP", nil},                // other project
		{"lowercase sap-12 is ignored", "SAP", nil},     // key must be uppercase
		{"no reference here", "SAP", nil},
		{"version 1.2-3 is not a ref", "SAP", nil},
	}
	for _, tc := range cases {
		got := refsFor(tc.text, tc.key)
		if len(got) != len(tc.want) {
			t.Errorf("refsFor(%q) = %v, want %v", tc.text, got, tc.want)
			continue
		}
		for i := range got {
			if got[i] != tc.want[i] {
				t.Errorf("refsFor(%q)[%d] = %s, want %s", tc.text, i, got[i], tc.want[i])
			}
		}
	}
}

func TestScmNotesFromGitHubPush(t *testing.T) {
	body := `{"commits":[{"id":"abcdef1234567","message":"fix SAP-5 crash\nmore detail","url":"https://gh/c/1","author":{"name":"Alice"}}]}`
	var p scmPayload
	if err := json.Unmarshal([]byte(body), &p); err != nil {
		t.Fatal(err)
	}
	notes := scmNotes(&p, "SAP")
	if len(notes) != 1 {
		t.Fatalf("got %d notes, want 1", len(notes))
	}
	if notes[0].taskNumber != "5" {
		t.Errorf("taskNumber = %s, want 5", notes[0].taskNumber)
	}
	for _, want := range []string{"abcdef1", "Alice", "fix SAP-5 crash", "https://gh/c/1"} {
		if !strings.Contains(notes[0].text, want) {
			t.Errorf("note %q missing %q", notes[0].text, want)
		}
	}
	// Only the first line of the message is quoted, not the whole body.
	if strings.Contains(notes[0].text, "more detail") {
		t.Error("only the commit subject should be quoted")
	}
}

func TestScmNotesFromGitHubPullRequest(t *testing.T) {
	body := `{"action":"closed","pull_request":{"number":9,"title":"SAP-8 add export","html_url":"https://gh/pr/9","merged":true}}`
	var p scmPayload
	if err := json.Unmarshal([]byte(body), &p); err != nil {
		t.Fatal(err)
	}
	notes := scmNotes(&p, "SAP")
	if len(notes) != 1 || notes[0].taskNumber != "8" {
		t.Fatalf("notes = %+v, want one note for task 8", notes)
	}
	// A merged PR must say "merged", not the raw action.
	if !strings.Contains(notes[0].text, "merged") {
		t.Errorf("note %q should report the merge", notes[0].text)
	}
}

func TestScmNotesFromGitLabMergeRequest(t *testing.T) {
	body := `{"object_kind":"merge_request","object_attributes":{"iid":4,"title":"SAP-3 refactor","url":"https://gl/mr/4","state":"merged"}}`
	var p scmPayload
	if err := json.Unmarshal([]byte(body), &p); err != nil {
		t.Fatal(err)
	}
	notes := scmNotes(&p, "SAP")
	if len(notes) != 1 || notes[0].taskNumber != "3" {
		t.Fatalf("notes = %+v, want one note for task 3", notes)
	}
	if !strings.Contains(notes[0].text, "!4") {
		t.Errorf("note %q should use GitLab's !iid notation", notes[0].text)
	}
}

func TestVerifySCMSignature(t *testing.T) {
	body := []byte(`{"a":1}`)
	secret := "topsecret"
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	valid := "sha256=" + hex.EncodeToString(mac.Sum(nil))

	if !verifySCMSignature(secret, body, valid) {
		t.Error("a correct signature must be accepted")
	}
	if verifySCMSignature(secret, body, "sha256=deadbeef") {
		t.Error("a wrong signature must be rejected")
	}
	if verifySCMSignature(secret, []byte(`{"a":2}`), valid) {
		t.Error("a signature must not validate a different body")
	}
	// With no secret configured the hook is open by design.
	if !verifySCMSignature("", body, "") {
		t.Error("no secret configured should accept the request")
	}
}

func TestFirstLine(t *testing.T) {
	if got := firstLine("one\ntwo"); got != "one" {
		t.Errorf("firstLine = %q, want one", got)
	}
	if got := firstLine("single"); got != "single" {
		t.Errorf("firstLine = %q, want single", got)
	}
}
