"""Write SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL ghi của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import text

PUT_PROJECT_FOLDER_UPDATE_PROJECTS = text(
    """UPDATE projects SET sharepoint_folder_url = :url, updated_at = :now
                   WHERE id = :id AND workspace_id = :workspace AND archived_at IS NULL RETURNING id"""
)


RECORD_INSERT_ATTACHMENT_PUBLICATIONS = text(
    """INSERT INTO attachment_publications
               (attachment_id, workspace_id, path, item_id, web_url, published_at, attempted_at, attempts, last_error)
               VALUES (:attachment, :workspace, :path, :item, :url, :published, :now, :attempts, :error)
               ON CONFLICT (attachment_id) DO UPDATE SET
                 path = COALESCE(EXCLUDED.path, attachment_publications.path),
                 item_id = COALESCE(EXCLUDED.item_id, attachment_publications.item_id),
                 web_url = COALESCE(EXCLUDED.web_url, attachment_publications.web_url),
                 published_at = COALESCE(EXCLUDED.published_at, attachment_publications.published_at),
                 attempted_at = EXCLUDED.attempted_at,
                 attempts = CASE WHEN EXCLUDED.last_error IS NULL THEN 0 ELSE attachment_publications.attempts + 1 END,
                 last_error = EXCLUDED.last_error"""
)


PUBLISH_ATTACHMENTS_DUE_LOCK = text("SELECT pg_try_advisory_xact_lock(hashtextextended('sharepoint-attachments', 0))")


SAVE_CONNECTION_INSERT_SHAREPOINT_CONNECTIONS = text(
    """INSERT INTO sharepoint_connections
               (workspace_id, tenant_id, client_id, secret_encrypted, enabled, publish_attachments, updated_by, created_at, updated_at)
               VALUES (:workspace, :tenant, :client, :secret, :enabled, :attachments, :user, :now, :now)
               ON CONFLICT (workspace_id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id,
                 client_id = EXCLUDED.client_id, secret_encrypted = EXCLUDED.secret_encrypted,
                 enabled = EXCLUDED.enabled, publish_attachments = EXCLUDED.publish_attachments, updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at"""
)


RECORD_INSERT_DOCUMENT_PUBLICATIONS = text(
    """INSERT INTO document_publications
               (document_id, workspace_id, version, release, path, item_id, web_url, published_at, attempted_at, attempts, last_error)
               VALUES (:document, :workspace, :version, :release, :path, :item, :url, :published, :now, :attempts, :error)
               ON CONFLICT (document_id) DO UPDATE SET
                 version = COALESCE(EXCLUDED.version, document_publications.version),
                 release = COALESCE(EXCLUDED.release, document_publications.release),
                 path = COALESCE(EXCLUDED.path, document_publications.path),
                 item_id = COALESCE(EXCLUDED.item_id, document_publications.item_id),
                 web_url = COALESCE(EXCLUDED.web_url, document_publications.web_url),
                 published_at = COALESCE(EXCLUDED.published_at, document_publications.published_at),
                 attempted_at = EXCLUDED.attempted_at,
                 attempts = CASE WHEN EXCLUDED.last_error IS NULL THEN 0 ELSE document_publications.attempts + 1 END,
                 last_error = EXCLUDED.last_error"""
)


PUBLISH_DUE_LOCK = text("SELECT pg_try_advisory_xact_lock(hashtextextended('sharepoint-publish', 0))")
