package handlers

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"testing"
)

func TestSignPayloadMatchesStandardHMAC(t *testing.T) {
	secret := "s3cr3t"
	body := []byte(`{"type":"task.created"}`)

	// An independent HMAC-SHA256 computation must agree, so receivers using any
	// standard library can verify our signature.
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	want := hex.EncodeToString(mac.Sum(nil))

	if got := signPayload(secret, body); got != want {
		t.Errorf("signPayload = %q, want %q", got, want)
	}
}

func TestSignPayloadIsSensitiveToInputs(t *testing.T) {
	body := []byte(`{"a":1}`)
	base := signPayload("secret", body)

	if signPayload("other", body) == base {
		t.Error("changing the secret must change the signature")
	}
	if signPayload("secret", []byte(`{"a":2}`)) == base {
		t.Error("changing the body must change the signature")
	}
	if len(base) != 64 {
		t.Errorf("signature length = %d, want 64 hex chars", len(base))
	}
}

func TestSignPayloadIsDeterministic(t *testing.T) {
	body := []byte("payload")
	if signPayload("k", body) != signPayload("k", body) {
		t.Error("signature must be stable for the same input")
	}
}
