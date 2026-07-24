// Package config loads runtime configuration from environment variables.
package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

// Config holds all runtime configuration for the API server.
type Config struct {
	Env         string
	Port        string
	BaseURL     string
	FrontendURL string

	DatabaseURL string

	SessionSecret string
	SessionTTL    time.Duration

	SystemAdminEmails []string

	Azure      AzureConfig
	SharePoint SharePointConfig
}

// AzureConfig holds Azure AD (OIDC) credentials for SSO login.
type AzureConfig struct {
	TenantID     string
	ClientID     string
	ClientSecret string
	RedirectURL  string
}

// Issuer returns the OIDC issuer URL for the configured tenant.
func (a AzureConfig) Issuer() string {
	return fmt.Sprintf("https://login.microsoftonline.com/%s/v2.0", a.TenantID)
}

// Configured reports whether the minimum Azure AD settings are present.
func (a AzureConfig) Configured() bool {
	return a.TenantID != "" && a.ClientID != "" && a.ClientSecret != "" && a.RedirectURL != ""
}

// SharePointConfig holds Microsoft Graph credentials and the root folder used
// for syncing project files. It may reuse the Azure app registration.
type SharePointConfig struct {
	TenantID     string
	ClientID     string
	ClientSecret string
	SiteURL      string // e.g. "contoso.sharepoint.com:/sites/Projects"
	RootFolder   string // e.g. "/Flowie"
}

// Configured reports whether the minimum SharePoint settings are present.
func (s SharePointConfig) Configured() bool {
	return s.TenantID != "" && s.ClientID != "" && s.ClientSecret != "" && s.SiteURL != ""
}

// Load reads configuration from the environment, applying sane defaults.
func Load() (*Config, error) {
	ttlHours := getInt("SESSION_TTL_HOURS", 24)

	adminEmailsStr := getEnv("SYSTEM_ADMIN_EMAILS", "")
	var adminEmails []string
	if adminEmailsStr != "" {
		for _, e := range strings.Split(adminEmailsStr, ",") {
			e = strings.TrimSpace(e)
			e = strings.Trim(e, `"'`)
			if e != "" {
				adminEmails = append(adminEmails, e)
			}
		}
	}

	cfg := &Config{
		Env:         getEnv("APP_ENV", "development"),
		Port:        getEnv("APP_PORT", "8080"),
		BaseURL:     getEnv("APP_BASE_URL", "http://localhost:8080"),
		FrontendURL: getEnv("FRONTEND_URL", "http://localhost:3000"),
		DatabaseURL: getEnv("DATABASE_URL", ""),

		SessionSecret:     getEnv("SESSION_SECRET", ""),
		SessionTTL:        time.Duration(ttlHours) * time.Hour,
		SystemAdminEmails: adminEmails,

		Azure: AzureConfig{
			TenantID:     getEnv("AZURE_AD_TENANT_ID", ""),
			ClientID:     getEnv("AZURE_AD_CLIENT_ID", ""),
			ClientSecret: getEnv("AZURE_AD_CLIENT_SECRET", ""),
			RedirectURL:  getEnv("AZURE_AD_REDIRECT_URL", ""),
		},
		SharePoint: SharePointConfig{
			TenantID:     getEnv("GRAPH_TENANT_ID", ""),
			ClientID:     getEnv("GRAPH_CLIENT_ID", ""),
			ClientSecret: getEnv("GRAPH_CLIENT_SECRET", ""),
			SiteURL:      getEnv("SHAREPOINT_SITE_URL", ""),
			RootFolder:   getEnv("SHAREPOINT_ROOT_FOLDER", "/Flowie"),
		},
	}

	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}
	if len(cfg.SessionSecret) < 32 {
		return nil, fmt.Errorf("SESSION_SECRET must be at least 32 bytes")
	}
	return cfg, nil
}

func getEnv(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return fallback
}

func getInt(key string, fallback int) int {
	if v, ok := os.LookupEnv(key); ok {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}
