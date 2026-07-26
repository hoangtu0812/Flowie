package auth

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// SessionRegistry is the subset of the session store the auth layer needs to
// enforce remote revocation. It is optional: when nil, sessions are pure JWT.
type SessionRegistry interface {
	IsRevoked(ctx context.Context, tokenHash string) (bool, error)
	Touch(ctx context.Context, tokenHash string)
}

// HashToken returns the digest stored for a session token. The raw token is
// never persisted.
func HashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// sessionCookieName is the name of the httpOnly session cookie.
const sessionCookieName = "flowie_session"

// SessionManager issues and verifies signed session tokens (JWT) and manages
// the session cookie.
type SessionManager struct {
	secret   []byte
	ttl      time.Duration
	secure   bool
	registry SessionRegistry
}

// UseRegistry enables DB-backed revocation checks in RequireAuth.
func (m *SessionManager) UseRegistry(reg SessionRegistry) { m.registry = reg }

// TTL exposes the configured session lifetime (used when recording sessions).
func (m *SessionManager) TTL() time.Duration { return m.ttl }

// TokenFromRequest exposes the request's session token to handlers.
func TokenFromRequest(r *http.Request) string { return tokenFromRequest(r) }

// NewSessionManager creates a SessionManager. secure=true sets the cookie
// Secure flag (use in production over HTTPS).
func NewSessionManager(secret string, ttl time.Duration, secure bool) *SessionManager {
	return &SessionManager{secret: []byte(secret), ttl: ttl, secure: secure}
}

// Claims is the JWT payload for an authenticated session.
type Claims struct {
	Email string `json:"email"`
	Name  string `json:"name"`
	// MFAPending marks a half-authenticated session: the user proved their
	// identity but still owes a second factor. RequireAuth rejects it.
	MFAPending bool `json:"mfaPending,omitempty"`
	jwt.RegisteredClaims
}

// Issue creates a fully-authenticated signed token for the given user.
func (m *SessionManager) Issue(userID uuid.UUID, email, name string) (string, error) {
	return m.issue(userID, email, name, false)
}

// IssuePending creates a token that only allows completing the MFA challenge.
func (m *SessionManager) IssuePending(userID uuid.UUID, email, name string) (string, error) {
	return m.issue(userID, email, name, true)
}

func (m *SessionManager) issue(userID uuid.UUID, email, name string, mfaPending bool) (string, error) {
	now := time.Now()
	ttl := m.ttl
	if mfaPending {
		// A challenge token is short-lived; it is not a usable session.
		ttl = 10 * time.Minute
	}
	claims := Claims{
		Email:      email,
		Name:       name,
		MFAPending: mfaPending,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject: userID.String(),
			// JWT timestamps have one-second resolution, so two tokens issued
			// for the same user within the same second would be byte-identical
			// and rotation would be a no-op. A random ID makes every token
			// unique (and gives each session a handle for revocation).
			ID:        uuid.NewString(),
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
		},
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return tok.SignedString(m.secret)
}

// Verify parses and validates a token, returning its claims.
func (m *SessionManager) Verify(tokenStr string) (*Claims, error) {
	claims := &Claims{}
	_, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return m.secret, nil
	})
	if err != nil {
		return nil, err
	}
	return claims, nil
}

// SetCookie writes the session cookie on the response.
func (m *SessionManager) SetCookie(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   m.secure,
		SameSite: http.SameSiteLaxMode,
		Expires:  time.Now().Add(m.ttl),
	})
}

// ClearCookie removes the session cookie (logout).
func (m *SessionManager) ClearCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   m.secure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})
}

// tokenFromRequest extracts the session token from cookie or Bearer header.
func tokenFromRequest(r *http.Request) string {
	if c, err := r.Cookie(sessionCookieName); err == nil && c.Value != "" {
		return c.Value
	}
	const prefix = "Bearer "
	if h := r.Header.Get("Authorization"); len(h) > len(prefix) && h[:len(prefix)] == prefix {
		return h[len(prefix):]
	}
	return ""
}
