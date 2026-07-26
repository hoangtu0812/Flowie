package auth

import (
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestHashTokenIsStableAndHidesTheToken(t *testing.T) {
	const token = "super-secret-token"
	h1 := HashToken(token)
	h2 := HashToken(token)

	if h1 != h2 {
		t.Error("HashToken must be deterministic")
	}
	if len(h1) != 64 { // sha256 hex
		t.Errorf("hash length = %d, want 64", len(h1))
	}
	if strings.Contains(h1, token) {
		t.Error("hash must not embed the raw token")
	}
	if HashToken("other-token") == h1 {
		t.Error("different tokens must hash differently")
	}
}

func TestIssueAndVerifyRoundTrip(t *testing.T) {
	m := NewSessionManager("test-secret", time.Hour, false)
	userID := uuid.New()

	tok, err := m.Issue(userID, "a@b.com", "Tester")
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}
	claims, err := m.Verify(tok)
	if err != nil {
		t.Fatalf("Verify: %v", err)
	}
	if claims.Subject != userID.String() {
		t.Errorf("Subject = %q, want %q", claims.Subject, userID)
	}
	if claims.Email != "a@b.com" {
		t.Errorf("Email = %q, want a@b.com", claims.Email)
	}
}

func TestVerifyRejectsWrongSecret(t *testing.T) {
	issuer := NewSessionManager("secret-a", time.Hour, false)
	verifier := NewSessionManager("secret-b", time.Hour, false)

	tok, err := issuer.Issue(uuid.New(), "a@b.com", "Tester")
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}
	if _, err := verifier.Verify(tok); err == nil {
		t.Error("expected verification to fail for a token signed with another secret")
	}
}

func TestVerifyRejectsExpiredToken(t *testing.T) {
	m := NewSessionManager("test-secret", -time.Hour, false) // already expired
	tok, err := m.Issue(uuid.New(), "a@b.com", "Tester")
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}
	if _, err := m.Verify(tok); err == nil {
		t.Error("expected an expired token to be rejected")
	}
}

func TestTTLIsExposed(t *testing.T) {
	m := NewSessionManager("s", 42*time.Minute, false)
	if m.TTL() != 42*time.Minute {
		t.Errorf("TTL() = %v, want 42m", m.TTL())
	}
}
