package sharepoint

import (
	"path"
)

// DefaultProjectSubfolders is the standard subfolder structure Flowie creates
// under each project folder, so files are organised consistently.
var DefaultProjectSubfolders = []string{
	"01_Documents",
	"02_Designs",
	"03_Deliverables",
	"04_Tasks",
	"05_Attachments",
}

// WorkspaceFolder returns the drive-relative folder path for a workspace under
// the configured root, e.g. "Flowie/acme-corp".
func (c *Client) WorkspaceFolder(workspaceSlug string) string {
	return path.Join(c.rootFolder, workspaceSlug)
}

// ProjectFolder returns the drive-relative folder path for a project, e.g.
// "Flowie/acme-corp/MKT-website-revamp".
func (c *Client) ProjectFolder(workspaceSlug, projectSlug string) string {
	return path.Join(c.rootFolder, workspaceSlug, projectSlug)
}

// TaskFolder returns the drive-relative folder path used to store a task's
// attachments, nested under the project's 04_Tasks folder.
func (c *Client) TaskFolder(workspaceSlug, projectSlug, taskRef string) string {
	return path.Join(c.rootFolder, workspaceSlug, projectSlug, "04_Tasks", taskRef)
}
