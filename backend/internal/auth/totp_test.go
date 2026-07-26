package auth

import (
	"strings"
	"testing"
	"time"
)

// RFC 6238 publishes test vectors for the seed "12345678901234567890"
// (ASCII). Base32 of that seed is GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ.
// The RFC's 8-digit values are truncated to the 6 digits we emit.
const rfcSecret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"

func TestTOTPMatchesRFC6238Vectors(t *testing.T) {
	cases := []struct {
		unix int64
		want string // last 6 digits of the RFC's SHA-1 vector
	}{
		{59, "287082"},
		{1111111109, "081804"},
		{1111111111, "050471"},
		{1234567890, "005924"},
		{2000000000, "279037"},
	}
	for _, tc := range cases {
		got, err := TOTPCode(rfcSecret, time.Unix(tc.unix, 0).UTC())
		if err != nil {
			t.Fatalf("TOTPCode(%d): %v", tc.unix, err)
		}
		if got != tc.want {
			t.Errorf("TOTPCode at %d = %s, want %s", tc.unix, got, tc.want)
		}
	}
}

func TestVerifyTOTPAcceptsCurrentCode(t *testing.T) {
	secret, err := NewTOTPSecret()
	if err != nil {
		t.Fatalf("NewTOTPSecret: %v", err)
	}
	now := time.Now()
	code, err := TOTPCode(secret, now)
	if err != nil {
		t.Fatalf("TOTPCode: %v", err)
	}
	if !VerifyTOTP(secret, code, now) {
		t.Error("the freshly generated code should verify")
	}
}

func TestVerifyTOTPToleratesOneWindowOfSkew(t *testing.T) {
	secret, _ := NewTOTPSecret()
	now := time.Now()

	prev, _ := TOTPCode(secret, now.Add(-30*time.Second))
	next, _ := TOTPCode(secret, now.Add(30*time.Second))
	if !VerifyTOTP(secret, prev, now) {
		t.Error("the previous window should be accepted (clock skew)")
	}
	if !VerifyTOTP(secret, next, now) {
		t.Error("the next window should be accepted (clock skew)")
	}

	// Two windows away must be rejected, otherwise the code lives too long.
	far, _ := TOTPCode(secret, now.Add(-90*time.Second))
	if VerifyTOTP(secret, far, now) {
		t.Error("a code from 3 windows ago must be rejected")
	}
}

func TestVerifyTOTPRejectsBadInput(t *testing.T) {
	secret, _ := NewTOTPSecret()
	now := time.Now()
	valid, _ := TOTPCode(secret, now)

	for _, bad := range []string{"", "12345", "1234567", "abcdef", "000000"} {
		if bad == valid {
			continue // astronomically unlikely, but keep the test honest
		}
		if VerifyTOTP(secret, bad, now) {
			t.Errorf("code %q must not verify", bad)
		}
	}
	// A different secret must not validate this code.
	other, _ := NewTOTPSecret()
	if VerifyTOTP(other, valid, now) {
		t.Error("a code must not verify against a different secret")
	}
}

func TestNewTOTPSecretIsRandomAndDecodable(t *testing.T) {
	a, err := NewTOTPSecret()
	if err != nil {
		t.Fatal(err)
	}
	b, _ := NewTOTPSecret()
	if a == b {
		t.Error("secrets must not repeat")
	}
	if _, err := TOTPCode(a, time.Now()); err != nil {
		t.Errorf("generated secret must be usable: %v", err)
	}
}

func TestProvisioningURIContainsTheEssentials(t *testing.T) {
	uri := TOTPProvisioningURI("ABCD2345", "user@corp.com", "Flowie")
	for _, want := range []string{"otpauth://totp/", "secret=ABCD2345", "issuer=Flowie", "digits=6", "period=30"} {
		if !strings.Contains(uri, want) {
			t.Errorf("URI %q missing %q", uri, want)
		}
	}
}

func TestRecoveryCodesAreUnique(t *testing.T) {
	codes, err := NewRecoveryCodes(10)
	if err != nil {
		t.Fatal(err)
	}
	if len(codes) != 10 {
		t.Fatalf("got %d codes, want 10", len(codes))
	}
	seen := map[string]bool{}
	for _, c := range codes {
		if c == "" {
			t.Error("empty recovery code")
		}
		if seen[c] {
			t.Errorf("duplicate recovery code %q", c)
		}
		seen[c] = true
	}
}
