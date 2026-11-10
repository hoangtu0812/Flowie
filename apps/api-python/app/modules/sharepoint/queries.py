"""Read SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL đọc của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import text

PROJECT_PUBLISHING_SELECT_PROJECTS = text("SELECT sharepoint_folder_url FROM projects WHERE id = :id AND workspace_id = :workspace")


CONNECTION_ROW_SELECT_SHAREPOINT_CONNECTIONS = text("SELECT * FROM sharepoint_connections WHERE workspace_id = :workspace")


FOLDER_NAMES_SELECT_DOCUMENT_FOLDERS = text(
    """WITH RECURSIVE chain AS (
                     SELECT id, parent_id, name, number, kind, 0 AS depth FROM document_folders WHERE id = :id
                     UNION ALL
                     SELECT f.id, f.parent_id, f.name, f.number, f.kind, chain.depth + 1
                     FROM document_folders f JOIN chain ON f.id = chain.parent_id WHERE chain.depth < 16)
                   SELECT name, number, kind, parent_id FROM chain ORDER BY depth DESC"""
)


# Every attachment of a publishing project is numbered within its SharePoint folder (`copy`),
# archived issues and deleted comments included, so a later file can never take the name of
# one already uploaded. Only active ones that are not yet uploaded are due.
# shortcut: the numbering scans all attachments of enabled workspaces each run; add a stored
# copy number if that table grows past what a one-minute scan handles.
# VI: Mọi attachment của dự án có phát hành được đánh số trong thư mục SharePoint của nó (`copy`),
# VI: kể cả issue đã archive và comment đã xóa, để file sau không bao giờ lấy tên của file đã tải.
# VI: Chỉ attachment còn hoạt động và chưa tải lên mới đến hạn.
# VI: shortcut: việc đánh số quét mọi attachment của workspace đang bật mỗi lượt; lưu sẵn số thứ
# VI: tự nếu bảng lớn tới mức một lượt mỗi phút không kịp.
ATTACHMENT_DUE = text("""
WITH targets AS (
  SELECT a.id, a.workspace_id, a.entity_type, a.object_key, a.filename, a.mime_type, a.created_at,
         p.id AS project_id, p.sharepoint_folder_url,
         COALESCE(i.identifier, ci.identifier) AS issue_key, COALESCE(i.title, ci.title) AS issue_title,
         COALESCE(df.id, ddf.id) AS folder_id,
         CASE WHEN a.entity_type IN ('issue', 'comment') THEN i.archived_at IS NULL AND ci.archived_at IS NULL
                AND cm.deleted_at IS NULL
              WHEN a.entity_type = 'document' THEN dd.archived_at IS NULL
              ELSE TRUE END AS active,
         ROW_NUMBER() OVER (
           PARTITION BY p.id, CASE WHEN a.entity_type IN ('issue', 'comment') THEN 'i:' || COALESCE(i.id, ci.id)
                                   WHEN a.entity_type IN ('document', 'document-folder') THEN 'f:' || COALESCE(df.id, ddf.id)
                                   ELSE 'p' END, lower(a.filename)
           ORDER BY a.created_at, a.id) AS copy
  FROM attachments a
  JOIN sharepoint_connections c ON c.workspace_id = a.workspace_id AND c.enabled AND c.publish_attachments
  LEFT JOIN issues i ON a.entity_type = 'issue' AND i.id = a.entity_id
  LEFT JOIN comments cm ON a.entity_type = 'comment' AND cm.id = a.entity_id
  LEFT JOIN issues ci ON ci.id = cm.issue_id
  LEFT JOIN project_updates pu ON a.entity_type = 'project-update' AND pu.id = a.entity_id
  LEFT JOIN document_folders df ON a.entity_type = 'document-folder' AND df.id = a.entity_id
  LEFT JOIN documents dd ON a.entity_type = 'document' AND dd.id = a.entity_id
  LEFT JOIN document_folders ddf ON ddf.id = dd.folder_id
  JOIN projects p ON p.workspace_id = a.workspace_id AND p.archived_at IS NULL
   AND p.sharepoint_folder_url IS NOT NULL
   AND p.id = COALESCE(i.project_id, ci.project_id, pu.project_id, df.project_id, ddf.project_id,
                       CASE WHEN a.entity_type = 'project' THEN a.entity_id END)
)
SELECT t.* FROM targets t
LEFT JOIN attachment_publications pub ON pub.attachment_id = t.id
WHERE t.active AND pub.published_at IS NULL
  AND (pub.attempted_at IS NULL OR pub.attempted_at <
       CAST(:now AS timestamp) - make_interval(mins => LEAST(CAST(:cap AS int), power(2, LEAST(pub.attempts, 6))::int)))
ORDER BY t.created_at, t.id
LIMIT :limit
""")


# The latest release decides what is due, not the document status: a document back in Draft
# keeps its last release published until the next approval.
# VI: Phiên bản mới nhất quyết định việc đến hạn, không phải trạng thái tài liệu: tài liệu đã
# VI: về Nháp vẫn giữ phiên bản cuối đã phát hành cho tới lần duyệt kế tiếp.
RELEASE_DUE = text("""
SELECT d.id, d.workspace_id, d.folder_id, r.release, r.revision, r.title, r.content,
       r.approved_at, u.name AS approver, p.id AS project_id, p.sharepoint_folder_url
FROM documents d
JOIN LATERAL (
  SELECT * FROM document_releases WHERE document_id = d.id ORDER BY release DESC LIMIT 1
) r ON TRUE
LEFT JOIN users u ON u.id = r.approved_by
JOIN document_folders f ON f.id = d.folder_id
JOIN projects p ON p.id = f.project_id AND p.archived_at IS NULL
JOIN sharepoint_connections c ON c.workspace_id = d.workspace_id AND c.enabled
LEFT JOIN document_publications pub ON pub.document_id = d.id
WHERE d.archived_at IS NULL AND p.sharepoint_folder_url IS NOT NULL
  AND (pub.release IS NULL OR pub.release < r.release)
  AND (pub.attempted_at IS NULL OR pub.last_error IS NULL OR pub.attempted_at <
       CAST(:now AS timestamp) - make_interval(mins => LEAST(CAST(:cap AS int), power(2, LEAST(pub.attempts, 6))::int)))
ORDER BY r.approved_at
LIMIT :limit
""")
