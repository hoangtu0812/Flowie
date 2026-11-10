"""Write SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL ghi của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import text

IMPORT_PREVIEW_LOCK = text("SELECT pg_advisory_xact_lock(hashtextextended(:key,0))")


IMPORT_PREVIEW_INSERT_ISSUE_IMPORT_BATCHES = text("""INSERT INTO issue_import_batches(id,workspace_id,actor_id,team_id,source_key,request_key,fingerprint,duplicate_mode,created_at,expires_at)
        VALUES (:id,:workspace,:actor,:team,:source,:key,:fingerprint,:mode,:now,:expires)""")


IMPORT_PREVIEW_INSERT_ISSUE_IMPORT_ROWS = text("""INSERT INTO issue_import_rows(batch_id,row_number,external_id,payload,state,error_code)
            VALUES (:batch,:number,:external,CAST(:payload AS jsonb),:state,:code)""")


IMPORT_COMMAND_UPDATE_ISSUE_IMPORT_BATCHES = text("UPDATE issue_import_batches SET state='QUEUED' WHERE id=:id")


IMPORT_COMMAND_UPDATE_ISSUE_IMPORT_BATCHES_2 = text("UPDATE issue_import_batches SET state='CANCELED' WHERE id=:id")


PROCESS_IMPORT_ROW_UPDATE_ISSUE_IMPORT_BATCHES = text(
    "UPDATE issue_import_batches SET state='EXPIRED' WHERE state='PREVIEW' AND expires_at<=:now"
)


PROCESS_IMPORT_ROW_DELETE_ISSUE_IMPORT_BATCHES = text(
    "DELETE FROM issue_import_batches WHERE state NOT IN ('RUNNING','QUEUED') AND created_at<:old"
)


PROCESS_IMPORT_ROW_UPDATE_ISSUE_IMPORT_ROWS = text(
    "UPDATE issue_import_rows SET state=:state,error_code=:code,issue_id=:issue,identifier=:identifier WHERE batch_id=:batch AND row_number=:number"
)


PROCESS_IMPORT_ROW_UPDATE_ISSUE_IMPORT_BATCHES_2 = text(
    "UPDATE issue_import_batches SET state=CASE WHEN EXISTS(SELECT 1 FROM issue_import_rows WHERE batch_id=:id AND state='PENDING') THEN 'RUNNING' ELSE 'DONE' END WHERE id=:id"
)


PROCESS_IMPORT_ROW_UPDATE_ISSUE_IMPORT_BATCHES_3 = text("UPDATE issue_import_batches SET state=:state WHERE id=:id")


PROCESS_IMPORT_ROW_LOCK = text("SELECT pg_advisory_xact_lock(hashtextextended(:key,0))")


PROCESS_IMPORT_ROW_INSERT_ISSUE_IMPORT_KEYS = text(
    "INSERT INTO issue_import_keys(workspace_id,source_key,external_id,issue_id) VALUES (:workspace,:source,:external,:issue)"
)
