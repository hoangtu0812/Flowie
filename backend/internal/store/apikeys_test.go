package store

import (
	"strings"
	"testing"
)

func TestGenerateAPIKeyShape(t *testing.T) {
	a, err := GenerateAPIKey()
	if err != nil {
		t.Fatalf("GenerateAPIKey: %v", err)
	}
	if !strings.HasPrefix(a, "flw_") {
		t.Errorf("key %q must carry the flw_ prefix so it is recognisable", a)
	}
	if len(a) < 40 {
		t.Errorf("key length = %d, want >= 40 for 256 bits of entropy", len(a))
	}
	b, _ := GenerateAPIKey()
	if a == b {
		t.Error("generated keys must not repeat")
	}
}

func TestHashAPIKeyHidesTheSecret(t *testing.T) {
	key, _ := GenerateAPIKey()
	h := HashAPIKey(key)

	if len(h) != 64 {
		t.Errorf("hash length = %d, want 64 (sha256 hex)", len(h))
	}
	if strings.Contains(h, key) {
		t.Error("hash must not embed the plaintext key")
	}
	if HashAPIKey(key) != h {
		t.Error("hashing must be deterministic")
	}
	other, _ := GenerateAPIKey()
	if HashAPIKey(other) == h {
		t.Error("different keys must hash differently")
	}
}

func TestVisiblePrefixLeaksOnlyTheLabel(t *testing.T) {
	key := "flw_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	p := visiblePrefix(key)

	if !strings.HasPrefix(key, p) {
		t.Errorf("prefix %q is not a prefix of the key", p)
	}
	if len(p) >= len(key) {
		t.Error("prefix must be shorter than the key — it is shown in the UI")
	}
	if len(p) != len("flw_")+6 {
		t.Errorf("prefix length = %d, want %d", len(p), len("flw_")+6)
	}
	// A short key must not panic or over-slice.
	if got := visiblePrefix("flw_x"); got != "flw_x" {
		t.Errorf("short key prefix = %q, want the key itself", got)
	}
}

func TestResolvedKeyScopes(t *testing.T) {
	k := &ResolvedKey{Scopes: []string{"read"}}
	if !k.HasScope("read") {
		t.Error("read scope should be reported")
	}
	if k.HasScope("write") {
		t.Error("write must not be granted by a read-only key")
	}

	rw := &ResolvedKey{Scopes: []string{"read", "write"}}
	if !rw.HasScope("write") {
		t.Error("write scope should be reported")
	}

	none := &ResolvedKey{}
	if none.HasScope("read") {
		t.Error("a key with no scopes grants nothing")
	}
}
