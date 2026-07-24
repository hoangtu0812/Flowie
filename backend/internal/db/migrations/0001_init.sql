-- ─────────────────────────────────────────────────────────────
-- Flowie · 0001 · Foundation schema
-- Module 1 (IAM) + Module 2 (Workspace/Project hierarchy) + core Tasks
-- ─────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "citext";   -- email không phân biệt hoa/thường

-- ── Users ────────────────────────────────────────────────────
-- Người dùng được provision khi đăng nhập lần đầu qua Azure AD (SSO).
CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    azure_oid     TEXT UNIQUE,                 -- object id từ Azure AD (sub/oid claim)
    email         CITEXT NOT NULL UNIQUE,
    display_name  TEXT NOT NULL DEFAULT '',
    avatar_url    TEXT NOT NULL DEFAULT '',
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Workspaces (Tổ chức) ─────────────────────────────────────
CREATE TABLE workspaces (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                   TEXT NOT NULL,
    slug                   TEXT NOT NULL UNIQUE,
    -- Đường dẫn folder con trong SharePoint root, tự sinh khi tạo workspace.
    sharepoint_folder_path TEXT NOT NULL DEFAULT '',
    sharepoint_item_id     TEXT NOT NULL DEFAULT '', -- Graph driveItem id (cache)
    created_by             UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Vai trò cấp Workspace (Module 1.2).
CREATE TYPE workspace_role AS ENUM ('owner', 'admin', 'billing', 'member', 'guest');

CREATE TABLE workspace_members (
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role         workspace_role NOT NULL DEFAULT 'member',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, user_id)
);

-- ── Portfolios (Danh mục dự án) ──────────────────────────────
CREATE TABLE portfolios (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Projects (Dự án) ─────────────────────────────────────────
CREATE TYPE project_status AS ENUM ('active', 'archived');

CREATE TABLE projects (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id           UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    portfolio_id           UUID REFERENCES portfolios(id) ON DELETE SET NULL,
    name                   TEXT NOT NULL,
    key                    TEXT NOT NULL,          -- prefix ngắn, ví dụ "MKT"
    description            TEXT NOT NULL DEFAULT '',
    status                 project_status NOT NULL DEFAULT 'active',
    sharepoint_folder_path TEXT NOT NULL DEFAULT '',
    sharepoint_item_id     TEXT NOT NULL DEFAULT '',
    start_date             DATE,
    end_date               DATE,
    created_by             UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, key)
);

CREATE TYPE project_role AS ENUM ('manager', 'contributor', 'viewer');

CREATE TABLE project_members (
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role       project_role NOT NULL DEFAULT 'contributor',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, user_id)
);

-- ── Tasks (Công việc) ────────────────────────────────────────
-- Trạng thái để mở (TEXT) nhằm hỗ trợ Custom Status (Module 3.1).
CREATE TABLE tasks (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id     UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parent_task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    title          TEXT NOT NULL,
    description    TEXT NOT NULL DEFAULT '',
    status         TEXT NOT NULL DEFAULT 'todo',
    priority       TEXT NOT NULL DEFAULT 'medium',
    assignee_id    UUID REFERENCES users(id) ON DELETE SET NULL,
    reporter_id    UUID REFERENCES users(id) ON DELETE SET NULL,
    story_points   NUMERIC(5,1),
    start_date     DATE,
    due_date       DATE,
    position       DOUBLE PRECISION NOT NULL DEFAULT 0, -- thứ tự trong cột/list
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX idx_tasks_parent ON tasks(parent_task_id);
CREATE INDEX idx_projects_workspace ON projects(workspace_id);
CREATE INDEX idx_workspace_members_user ON workspace_members(user_id);
CREATE INDEX idx_project_members_user ON project_members(user_id);

-- Trigger cập nhật updated_at tự động.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated      BEFORE UPDATE ON users      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_workspaces_updated BEFORE UPDATE ON workspaces FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_portfolios_updated BEFORE UPDATE ON portfolios FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_projects_updated   BEFORE UPDATE ON projects   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_tasks_updated      BEFORE UPDATE ON tasks      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
