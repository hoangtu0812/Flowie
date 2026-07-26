package handlers

import (
	"strings"
	"testing"
)

func TestSafeFileNameStripsPathsAndUnsafeChars(t *testing.T) {
	cases := []struct{ in, want string }{
		{"report.pdf", "report.pdf"},
		// Directory traversal must not survive.
		{"../../etc/passwd", "passwd"},
		{`C:\Windows\system32\cmd.exe`, "cmd.exe"},
		{"/absolute/path/file.txt", "file.txt"},
		// SharePoint-illegal characters are replaced, not dropped silently.
		{`bad:name*with?chars".txt`, "bad_name_with_chars_.txt"},
		{"has#hash%percent.doc", "has_hash_percent.doc"},
		// Hidden/relative names are normalised.
		{".hidden", "hidden"},
		{"   spaced.txt   ", "spaced.txt"},
		{"", "file"},
	}
	for _, tc := range cases {
		if got := safeFileName(tc.in); got != tc.want {
			t.Errorf("safeFileName(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestSafeFileNameNeverContainsSeparators(t *testing.T) {
	for _, in := range []string{"a/b/c.txt", `a\b\c.txt`, "..//../x"} {
		got := safeFileName(in)
		if strings.ContainsAny(got, `/\`) {
			t.Errorf("safeFileName(%q) = %q still contains a separator", in, got)
		}
	}
}

func TestSafeFileNameCapsLength(t *testing.T) {
	long := strings.Repeat("a", 300) + ".pdf"
	got := safeFileName(long)
	if len(got) > 180 {
		t.Errorf("name length = %d, want <= 180", len(got))
	}
	if !strings.HasSuffix(got, ".pdf") {
		t.Errorf("extension must be preserved when truncating, got %q", got[len(got)-10:])
	}
}

func TestAttachmentFolderLayout(t *testing.T) {
	got := attachmentFolder("Projects/SAP", "SAP-12")
	if got != "Projects/SAP/04_Tasks/SAP-12" {
		t.Errorf("attachmentFolder = %q", got)
	}
	// Leading/trailing slashes must not produce a double separator.
	if got := attachmentFolder("/Projects/SAP/", "SAP-1"); strings.Contains(got, "//") {
		t.Errorf("attachmentFolder produced a double slash: %q", got)
	}
	// An unset project folder still yields a usable path.
	if got := attachmentFolder("", "SAP-1"); !strings.HasPrefix(got, "Projects/") {
		t.Errorf("empty project folder fallback = %q", got)
	}
}
