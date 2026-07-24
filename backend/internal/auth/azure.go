package auth

import (
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"net/http"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/flowie/backend/internal/config"
	"golang.org/x/oauth2"
)

// AzureProvider wraps OIDC discovery + OAuth2 config for Azure AD login.
type AzureProvider struct {
	oauth    *oauth2.Config
	verifier *oidc.IDTokenVerifier
}

// AzureClaims are the ID-token claims Flowie relies on.
type AzureClaims struct {
	OID               string `json:"oid"`   // stable Azure object id
	Subject           string `json:"sub"`   // subject (fallback identity)
	Email             string `json:"email"` // may be empty depending on tenant
	PreferredUsername string `json:"preferred_username"`
	Name              string `json:"name"`
	Picture           string `json:"picture"`
}

// ResolvedEmail returns the best available email for the user.
func (c AzureClaims) ResolvedEmail() string {
	if c.Email != "" {
		return c.Email
	}
	return c.PreferredUsername
}

// ResolvedOID returns a stable identifier, preferring oid over sub.
func (c AzureClaims) ResolvedOID() string {
	if c.OID != "" {
		return c.OID
	}
	return c.Subject
}

// NewAzureProvider performs OIDC discovery against the tenant and builds the
// OAuth2 config. Returns nil provider (no error) when Azure is not configured
// so the server can still boot for local development.
func NewAzureProvider(ctx context.Context, cfg config.AzureConfig) (*AzureProvider, error) {
	if !cfg.Configured() {
		return nil, nil
	}
	provider, err := oidc.NewProvider(ctx, cfg.Issuer())
	if err != nil {
		return nil, fmt.Errorf("oidc discovery: %w", err)
	}
	return &AzureProvider{
		oauth: &oauth2.Config{
			ClientID:     cfg.ClientID,
			ClientSecret: cfg.ClientSecret,
			RedirectURL:  cfg.RedirectURL,
			Endpoint:     provider.Endpoint(),
			Scopes:       []string{oidc.ScopeOpenID, "profile", "email", "User.Read"},
		},
		verifier: provider.Verifier(&oidc.Config{ClientID: cfg.ClientID}),
	}, nil
}

// AuthCodeURL builds the Azure authorization URL for the given state + nonce.
func (p *AzureProvider) AuthCodeURL(state, nonce string) string {
	return p.oauth.AuthCodeURL(state, oidc.Nonce(nonce))
}

// Exchange swaps the authorization code for tokens and validates the ID token,
// returning the verified claims.
func (p *AzureProvider) Exchange(ctx context.Context, code, nonce string) (*AzureClaims, error) {
	token, err := p.oauth.Exchange(ctx, code)
	if err != nil {
		return nil, fmt.Errorf("token exchange: %w", err)
	}
	rawID, ok := token.Extra("id_token").(string)
	if !ok {
		return nil, fmt.Errorf("no id_token in token response")
	}
	idToken, err := p.verifier.Verify(ctx, rawID)
	if err != nil {
		return nil, fmt.Errorf("verify id_token: %w", err)
	}
	if idToken.Nonce != nonce {
		return nil, fmt.Errorf("nonce mismatch")
	}
	var claims AzureClaims
	if err := idToken.Claims(&claims); err != nil {
		return nil, fmt.Errorf("parse claims: %w", err)
	}

	// Fallback: If picture is missing in claims, fetch directly from Graph API
	if claims.Picture == "" {
		claims.Picture = fetchAzurePhoto(ctx, token.AccessToken)
	}

	return &claims, nil
}

// fetchAzurePhoto calls the Microsoft Graph API to download the user's profile photo.
func fetchAzurePhoto(ctx context.Context, accessToken string) string {
	req, err := http.NewRequestWithContext(ctx, "GET", "https://graph.microsoft.com/v1.0/me/photo/$value", nil)
	if err != nil {
		return ""
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	resp, err := http.DefaultClient.Do(req)
	if err != nil || resp.StatusCode != http.StatusOK {
		if resp != nil {
			resp.Body.Close()
		}
		return ""
	}
	defer resp.Body.Close()

	b, err := io.ReadAll(resp.Body)
	if err != nil {
		return ""
	}
	mime := resp.Header.Get("Content-Type")
	if mime == "" {
		mime = "image/jpeg"
	}
	return "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(b)
}
