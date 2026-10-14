CREATE TYPE "IssueType" AS ENUM ('TASK', 'BUG');
CREATE TYPE "BugSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
ALTER TABLE issues ADD COLUMN issue_type "IssueType" NOT NULL DEFAULT 'TASK',
    ADD COLUMN severity "BugSeverity", ADD COLUMN environment TEXT,
    ADD COLUMN reproduction_steps TEXT, ADD COLUMN expected_result TEXT,
    ADD COLUMN actual_result TEXT;
CREATE INDEX issues_workspace_id_issue_type_severity_idx ON issues(workspace_id,issue_type,severity);
