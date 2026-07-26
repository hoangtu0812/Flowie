package store_test

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/flowie/backend/internal/db"
	"github.com/flowie/backend/internal/domain"
	"github.com/flowie/backend/internal/store"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Integration tests run against a real PostgreSQL instance so the SQL itself is
// exercised — the unit tests elsewhere only cover pure logic.
//
// They are skipped unless TEST_DATABASE_URL is set, e.g.
//
//	TEST_DATABASE_URL='postgres://flowie:...@localhost:5432/flowie_test?sslmode=disable' go test ./internal/store/
//
// Point it at a throwaway database: every test creates and removes its own
// workspace, and the schema is migrated on connect.

func testPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set — skipping integration tests")
	}
	ctx := context.Background()
	pool, err := db.Connect(ctx, dsn)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	if err := db.Migrate(ctx, pool); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	t.Cleanup(pool.Close)
	return pool
}

// fixture creates an isolated workspace + project + user for one test and
// removes them afterwards, so tests never see each other's rows.
type fixture struct {
	st        *store.Store
	ctx       context.Context
	userID    uuid.UUID
	wsID      uuid.UUID
	projectID uuid.UUID
}

func newFixture(t *testing.T) *fixture {
	t.Helper()
	pool := testPool(t)
	st := store.New(pool)
	ctx := context.Background()

	suffix := uuid.NewString()[:8]
	user, err := st.Users.UpsertFromAzure(ctx, "test|"+suffix,
		"itest-"+suffix+"@flowie.test", "Integration Test", "", false)
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	ws, err := st.Workspaces.Create(ctx, "IT WS "+suffix, "it-ws-"+suffix, user.ID)
	if err != nil {
		t.Fatalf("create workspace: %v", err)
	}
	proj, err := st.Projects.Create(ctx, store.CreateProjectParams{
		WorkspaceID: ws.ID,
		Name:        "IT Project",
		Key:         "IT" + suffix[:3],
		CreatedBy:   user.ID,
	})
	if err != nil {
		t.Fatalf("create project: %v", err)
	}

	t.Cleanup(func() {
		// Workspace delete cascades to projects, tasks and memberships.
		_ = st.Workspaces.Delete(ctx, ws.ID)
		_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, user.ID)
	})

	return &fixture{st: st, ctx: ctx, userID: user.ID, wsID: ws.ID, projectID: proj.ID}
}

func (f *fixture) newTask(t *testing.T, title string) *domain.Task {
	t.Helper()
	task, err := f.st.Tasks.Create(f.ctx, store.CreateTaskParams{
		ProjectID:  f.projectID,
		Title:      title,
		ReporterID: f.userID,
	})
	if err != nil {
		t.Fatalf("create task: %v", err)
	}
	return task
}

func TestIntegrationTaskLifecycle(t *testing.T) {
	f := newFixture(t)

	task := f.newTask(t, "First task")
	if task.Number == nil || *task.Number != 1 {
		t.Errorf("first task number = %v, want 1 (trigger should assign it)", task.Number)
	}
	second := f.newTask(t, "Second task")
	if second.Number == nil || *second.Number != 2 {
		t.Errorf("second task number = %v, want 2", second.Number)
	}

	// The per-project number must resolve back to the same task.
	found, err := f.st.Tasks.ByProjectNumber(f.ctx, f.projectID, "2")
	if err != nil {
		t.Fatalf("ByProjectNumber: %v", err)
	}
	if found.ID != second.ID {
		t.Errorf("ByProjectNumber returned %s, want %s", found.ID, second.ID)
	}

	if _, err := f.st.Tasks.UpdateStatus(f.ctx, task.ID, "done"); err != nil {
		t.Fatalf("UpdateStatus: %v", err)
	}
	stats, err := f.st.Tasks.ProjectStats(f.ctx, f.projectID)
	if err != nil {
		t.Fatalf("ProjectStats: %v", err)
	}
	if stats.Total != 2 || stats.Done != 1 {
		t.Errorf("stats total/done = %d/%d, want 2/1", stats.Total, stats.Done)
	}
}

func TestIntegrationDependencyCycleIsRejected(t *testing.T) {
	f := newFixture(t)
	a := f.newTask(t, "A")
	b := f.newTask(t, "B")

	if err := f.st.Tasks.AddDependency(f.ctx, a.ID, b.ID); err != nil {
		t.Fatalf("AddDependency: %v", err)
	}
	// B → A would close the loop and must be refused by the recursive check.
	if err := f.st.Tasks.AddDependency(f.ctx, b.ID, a.ID); err == nil {
		t.Error("expected the cycle to be rejected")
	}
	if err := f.st.Tasks.AddDependency(f.ctx, a.ID, a.ID); err == nil {
		t.Error("expected self-dependency to be rejected")
	}

	deps, err := f.st.Tasks.ListDependencies(f.ctx, a.ID)
	if err != nil {
		t.Fatalf("ListDependencies: %v", err)
	}
	if len(deps.BlockedBy) != 1 || deps.BlockedBy[0].ID != b.ID {
		t.Errorf("blockedBy = %+v, want exactly B", deps.BlockedBy)
	}
}

func TestIntegrationWorkflowStatusesSeedAndWIP(t *testing.T) {
	f := newFixture(t)
	if err := f.st.Tasks.SeedDefaultStatuses(f.ctx, f.projectID); err != nil {
		t.Fatalf("SeedDefaultStatuses: %v", err)
	}
	statuses, err := f.st.Tasks.ListStatuses(f.ctx, f.projectID)
	if err != nil {
		t.Fatalf("ListStatuses: %v", err)
	}
	if len(statuses) != 4 {
		t.Fatalf("got %d statuses, want the 4 defaults", len(statuses))
	}

	// Seeding twice must stay idempotent (ON CONFLICT DO NOTHING).
	if err := f.st.Tasks.SeedDefaultStatuses(f.ctx, f.projectID); err != nil {
		t.Fatalf("re-seed: %v", err)
	}
	again, _ := f.st.Tasks.ListStatuses(f.ctx, f.projectID)
	if len(again) != 4 {
		t.Errorf("re-seeding produced %d statuses, want 4", len(again))
	}

	var todoID uuid.UUID
	for _, s := range statuses {
		if s.Key == "todo" {
			todoID = s.ID
		}
	}
	limit := 1
	if err := f.st.Tasks.UpdateWorkflowStatus(f.ctx, f.projectID, todoID,
		store.StatusUpdateFields{SetWIPLimit: true, WIPLimit: &limit}); err != nil {
		t.Fatalf("set WIP limit: %v", err)
	}
	got, err := f.st.Tasks.WIPLimitFor(f.ctx, f.projectID, "todo")
	if err != nil || got == nil || *got != 1 {
		t.Errorf("WIPLimitFor = %v, want 1", got)
	}
}

func TestIntegrationTimerProducesWorklog(t *testing.T) {
	f := newFixture(t)
	task := f.newTask(t, "Timed task")

	if _, err := f.st.Worklogs.StartTimer(f.ctx, f.userID, task.ID, "working"); err != nil {
		t.Fatalf("StartTimer: %v", err)
	}
	// A second timer for the same user must be refused.
	if _, err := f.st.Worklogs.StartTimer(f.ctx, f.userID, task.ID, ""); err == nil {
		t.Error("expected the second concurrent timer to be rejected")
	}

	wl, err := f.st.Worklogs.StopTimer(f.ctx, f.userID, "")
	if err != nil {
		t.Fatalf("StopTimer: %v", err)
	}
	if wl.Source != "timer" {
		t.Errorf("worklog source = %q, want timer", wl.Source)
	}
	if wl.Minutes < 1 {
		t.Errorf("worklog minutes = %d, want at least 1", wl.Minutes)
	}
	if wl.Note != "working" {
		t.Errorf("note = %q, want the note captured at start", wl.Note)
	}
	// Stopping again has nothing to stop.
	if _, err := f.st.Worklogs.StopTimer(f.ctx, f.userID, ""); err == nil {
		t.Error("expected StopTimer to fail when no timer is running")
	}
}

func TestIntegrationCustomFieldsScopedToProject(t *testing.T) {
	f := newFixture(t)
	task := f.newTask(t, "With fields")

	def, err := f.st.Tasks.CreateCustomFieldDef(f.ctx, f.projectID, "Env", "dropdown",
		[]byte(`["DEV","PROD"]`))
	if err != nil {
		t.Fatalf("CreateCustomFieldDef: %v", err)
	}
	if err := f.st.Tasks.SetCustomFieldValue(f.ctx, task.ID, def.ID, []byte(`"PROD"`)); err != nil {
		t.Fatalf("SetCustomFieldValue: %v", err)
	}
	values, err := f.st.Tasks.ListCustomFieldValues(f.ctx, task.ID)
	if err != nil {
		t.Fatalf("ListCustomFieldValues: %v", err)
	}
	if len(values) != 1 || string(values[0].Value) != `"PROD"` {
		t.Errorf("values = %+v, want one PROD value", values)
	}

	// A field id from another project must not be settable on this task.
	other := newFixture(t)
	otherDef, err := other.st.Tasks.CreateCustomFieldDef(other.ctx, other.projectID, "X", "text", nil)
	if err != nil {
		t.Fatalf("create other field: %v", err)
	}
	if err := f.st.Tasks.SetCustomFieldValue(f.ctx, task.ID, otherDef.ID, []byte(`"leak"`)); err == nil {
		t.Error("expected a cross-project custom field write to be rejected")
	}
}

func TestIntegrationSessionRevocation(t *testing.T) {
	f := newFixture(t)
	const hash = "integration-test-token-hash"

	if err := f.st.Sessions.Create(f.ctx, f.userID, hash, "TestAgent", "127.0.0.1",
		time.Now().Add(time.Hour)); err != nil {
		t.Fatalf("Create session: %v", err)
	}
	revoked, err := f.st.Sessions.IsRevoked(f.ctx, hash)
	if err != nil || revoked {
		t.Fatalf("new session should be active (revoked=%v, err=%v)", revoked, err)
	}

	sessions, err := f.st.Sessions.ListForUser(f.ctx, f.userID)
	if err != nil || len(sessions) != 1 {
		t.Fatalf("ListForUser = %d sessions, err=%v", len(sessions), err)
	}
	if err := f.st.Sessions.Revoke(f.ctx, f.userID, sessions[0].ID); err != nil {
		t.Fatalf("Revoke: %v", err)
	}
	revoked, err = f.st.Sessions.IsRevoked(f.ctx, hash)
	if err != nil || !revoked {
		t.Errorf("session should read as revoked (revoked=%v, err=%v)", revoked, err)
	}
	// Unknown tokens must not be treated as revoked, so pre-existing JWTs work.
	if r, _ := f.st.Sessions.IsRevoked(f.ctx, "never-seen"); r {
		t.Error("an unknown token must not be reported as revoked")
	}
}

func TestIntegrationAPIKeyResolveAndRevoke(t *testing.T) {
	f := newFixture(t)

	plaintext, err := store.GenerateAPIKey()
	if err != nil {
		t.Fatalf("GenerateAPIKey: %v", err)
	}
	key, err := f.st.APIKeys.Create(f.ctx, f.wsID, f.userID, "itest", []string{"read"}, plaintext)
	if err != nil {
		t.Fatalf("Create key: %v", err)
	}
	if !key.Active {
		t.Error("a freshly created key must be active")
	}

	resolved, err := f.st.APIKeys.Resolve(f.ctx, plaintext)
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}
	if resolved.WorkspaceID != f.wsID {
		t.Errorf("key resolved to workspace %s, want %s", resolved.WorkspaceID, f.wsID)
	}
	if !resolved.HasScope("read") || resolved.HasScope("write") {
		t.Errorf("scopes = %v, want read only", resolved.Scopes)
	}

	if err := f.st.APIKeys.Revoke(f.ctx, f.wsID, key.ID); err != nil {
		t.Fatalf("Revoke: %v", err)
	}
	if _, err := f.st.APIKeys.Resolve(f.ctx, plaintext); err == nil {
		t.Error("a revoked key must no longer resolve")
	}
}

func TestIntegrationGDPRAnonymisationKeepsHistory(t *testing.T) {
	f := newFixture(t)
	task := f.newTask(t, "Task with history")
	if _, err := f.st.Tasks.AddComment(f.ctx, task.ID, f.userID, "my comment"); err != nil {
		t.Fatalf("AddComment: %v", err)
	}

	bundle, err := f.st.Users.ExportData(f.ctx, f.userID)
	if err != nil {
		t.Fatalf("ExportData: %v", err)
	}
	for _, key := range []string{"profile", "comments", "workspaceMemberships"} {
		if _, ok := bundle[key]; !ok {
			t.Errorf("export is missing the %q section", key)
		}
	}

	if err := f.st.Users.AnonymiseAccount(f.ctx, f.userID); err != nil {
		t.Fatalf("AnonymiseAccount: %v", err)
	}
	user, err := f.st.Users.GetByID(f.ctx, f.userID)
	if err != nil {
		t.Fatalf("user row must survive erasure: %v", err)
	}
	if user.IsActive {
		t.Error("erased account must be deactivated")
	}
	if user.Email == "" || user.Email[:8] != "deleted-" {
		t.Errorf("email = %q, want an anonymised placeholder", user.Email)
	}
	// The comment stays for the team but loses its author.
	comments, err := f.st.Tasks.ListComments(f.ctx, task.ID)
	if err != nil {
		t.Fatalf("ListComments: %v", err)
	}
	if len(comments) != 1 {
		t.Fatalf("comment history should survive, got %d", len(comments))
	}
	if comments[0].AuthorID != nil {
		t.Error("comment author must be detached after erasure")
	}
}
