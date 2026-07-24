// Package sharepoint provides a thin Microsoft Graph client used to sync
// Flowie project files into a configured SharePoint document library. It
// authenticates with the OAuth2 client-credentials flow (application
// permissions) and can auto-create a nested folder structure per
// Workspace / Project / Task.
package sharepoint

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/flowie/backend/internal/config"
)

const graphBase = "https://graph.microsoft.com/v1.0"

// Client talks to Microsoft Graph for a single SharePoint site + drive.
type Client struct {
	cfg        config.SharePointConfig
	http       *http.Client
	tokenURL   string
	rootFolder string

	mu        sync.Mutex
	token     string
	tokenExp  time.Time
	siteID    string
	driveID   string
	resolved  bool
}

// New builds a SharePoint client. Returns nil (no error) when not configured so
// the app can run without file storage during early development.
func New(cfg config.SharePointConfig) *Client {
	if !cfg.Configured() {
		return nil
	}
	return &Client{
		cfg:        cfg,
		http:       &http.Client{Timeout: 30 * time.Second},
		tokenURL:   fmt.Sprintf("https://login.microsoftonline.com/%s/oauth2/v2.0/token", cfg.TenantID),
		rootFolder: strings.Trim(cfg.RootFolder, "/"),
	}
}

// ---- Authentication (client credentials) ----------------------------------

func (c *Client) accessToken(ctx context.Context) (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.token != "" && time.Now().Before(c.tokenExp.Add(-1*time.Minute)) {
		return c.token, nil
	}

	form := url.Values{
		"client_id":     {c.cfg.ClientID},
		"client_secret": {c.cfg.ClientSecret},
		"scope":         {"https://graph.microsoft.com/.default"},
		"grant_type":    {"client_credentials"},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.tokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.http.Do(req)
	if err != nil {
		return "", fmt.Errorf("token request: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("token request failed (%d): %s", resp.StatusCode, body)
	}
	var tr struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tr); err != nil {
		return "", err
	}
	c.token = tr.AccessToken
	c.tokenExp = time.Now().Add(time.Duration(tr.ExpiresIn) * time.Second)
	return c.token, nil
}

// doJSON performs an authenticated Graph request and decodes the JSON response
// into out (may be nil). body may be nil.
func (c *Client) doJSON(ctx context.Context, method, path string, body io.Reader, contentType string, out any) error {
	tok, err := c.accessToken(ctx)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, method, graphBase+path, body)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+tok)
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("graph %s %s failed (%d): %s", method, path, resp.StatusCode, b)
	}
	if out != nil {
		return json.NewDecoder(resp.Body).Decode(out)
	}
	return nil
}

// ---- Site / drive resolution ----------------------------------------------

// resolve looks up the site id and default drive id for the configured site.
func (c *Client) resolve(ctx context.Context) error {
	c.mu.Lock()
	if c.resolved {
		c.mu.Unlock()
		return nil
	}
	c.mu.Unlock()

	var site struct {
		ID string `json:"id"`
	}
	if err := c.doJSON(ctx, http.MethodGet, "/sites/"+c.cfg.SiteURL, nil, "", &site); err != nil {
		return fmt.Errorf("resolve site: %w", err)
	}

	var drive struct {
		ID string `json:"id"`
	}
	if err := c.doJSON(ctx, http.MethodGet, "/sites/"+site.ID+"/drive", nil, "", &drive); err != nil {
		return fmt.Errorf("resolve drive: %w", err)
	}

	c.mu.Lock()
	c.siteID, c.driveID, c.resolved = site.ID, drive.ID, true
	c.mu.Unlock()
	return nil
}
