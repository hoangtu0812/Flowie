package store

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"

	"github.com/google/uuid"
)

// HashRecoveryCode returns the digest stored for a backup code. Codes are never
// persisted in clear text.
func HashRecoveryCode(code string) string {
	sum := sha256.Sum256([]byte(code))
	return hex.EncodeToString(sum[:])
}

// TwoFactorState describes a user's MFA configuration.
type TwoFactorState struct {
	Secret      string
	Enabled     bool
	RecoveryLen int
}

// TwoFactor returns the user's MFA state.
func (s *UserStore) TwoFactor(ctx context.Context, userID uuid.UUID) (*TwoFactorState, error) {
	var st TwoFactorState
	var codes []byte
	err := s.pool.QueryRow(ctx,
		`SELECT totp_secret, totp_enabled, recovery_codes FROM users WHERE id=$1`, userID).
		Scan(&st.Secret, &st.Enabled, &codes)
	if err != nil {
		return nil, ErrNotFound
	}
	var list []string
	if len(codes) > 0 {
		_ = json.Unmarshal(codes, &list)
	}
	st.RecoveryLen = len(list)
	return &st, nil
}

// StartTOTPEnrolment stores a pending secret without enabling MFA yet, so a
// failed enrolment cannot lock the user out.
func (s *UserStore) StartTOTPEnrolment(ctx context.Context, userID uuid.UUID, secret string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE users SET totp_secret=$2, totp_enabled=FALSE WHERE id=$1`, userID, secret)
	return err
}

// EnableTOTP switches MFA on and stores hashed recovery codes.
func (s *UserStore) EnableTOTP(ctx context.Context, userID uuid.UUID, hashedCodes []string) error {
	raw, _ := json.Marshal(hashedCodes)
	_, err := s.pool.Exec(ctx,
		`UPDATE users SET totp_enabled=TRUE, recovery_codes=$2 WHERE id=$1`, userID, raw)
	return err
}

// DisableTOTP clears the secret and recovery codes.
func (s *UserStore) DisableTOTP(ctx context.Context, userID uuid.UUID) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE users SET totp_enabled=FALSE, totp_secret='', recovery_codes='[]' WHERE id=$1`, userID)
	return err
}

// ConsumeRecoveryCode removes a matching backup code, returning true when one
// was spent. Codes are single-use.
func (s *UserStore) ConsumeRecoveryCode(ctx context.Context, userID uuid.UUID, code string) (bool, error) {
	var raw []byte
	if err := s.pool.QueryRow(ctx,
		`SELECT recovery_codes FROM users WHERE id=$1`, userID).Scan(&raw); err != nil {
		return false, err
	}
	var codes []string
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &codes)
	}
	want := HashRecoveryCode(code)
	out := make([]string, 0, len(codes))
	found := false
	for _, c := range codes {
		if !found && c == want {
			found = true
			continue // drop it: single use
		}
		out = append(out, c)
	}
	if !found {
		return false, nil
	}
	next, _ := json.Marshal(out)
	_, err := s.pool.Exec(ctx, `UPDATE users SET recovery_codes=$2 WHERE id=$1`, userID, next)
	return true, err
}
