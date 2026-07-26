package store

import (
	"context"

	"github.com/flowie/backend/internal/domain"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// AttachmentStore records metadata for files stored in SharePoint.
type AttachmentStore struct {
	pool *pgxpool.Pool
}

const attachmentColumns = `a.id, a.task_id, a.uploaded_by, a.name, a.size_bytes, a.content_type, a.drive_item_id, a.web_url, a.folder_path, a.created_at`

// ListByTask returns a task's attachments, newest first.
func (s *AttachmentStore) ListByTask(ctx context.Context, taskID uuid.UUID) ([]domain.Attachment, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT `+attachmentColumns+`, COALESCE(u.display_name, u.email::text, '')
		FROM attachments a
		LEFT JOIN users u ON u.id = a.uploaded_by
		WHERE a.task_id = $1
		ORDER BY a.created_at DESC`, taskID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.Attachment{}
	for rows.Next() {
		var a domain.Attachment
		if err := rows.Scan(&a.ID, &a.TaskID, &a.UploadedBy, &a.Name, &a.SizeBytes,
			&a.ContentType, &a.DriveItemID, &a.WebURL, &a.FolderPath, &a.CreatedAt,
			&a.UploaderName); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// Create records an uploaded file.
func (s *AttachmentStore) Create(ctx context.Context, a domain.Attachment) (*domain.Attachment, error) {
	var out domain.Attachment
	err := s.pool.QueryRow(ctx, `
		INSERT INTO attachments (task_id, uploaded_by, name, size_bytes, content_type, drive_item_id, web_url, folder_path)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		RETURNING id, task_id, uploaded_by, name, size_bytes, content_type, drive_item_id, web_url, folder_path, created_at`,
		a.TaskID, a.UploadedBy, a.Name, a.SizeBytes, a.ContentType, a.DriveItemID, a.WebURL, a.FolderPath).
		Scan(&out.ID, &out.TaskID, &out.UploadedBy, &out.Name, &out.SizeBytes,
			&out.ContentType, &out.DriveItemID, &out.WebURL, &out.FolderPath, &out.CreatedAt)
	return &out, err
}

// Delete removes an attachment record for a task.
func (s *AttachmentStore) Delete(ctx context.Context, taskID, id uuid.UUID) error {
	res, err := s.pool.Exec(ctx,
		`DELETE FROM attachments WHERE id=$1 AND task_id=$2`, id, taskID)
	if err != nil {
		return err
	}
	if res.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
