"""Write SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL ghi của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import text

CREATE_SCHEDULE_LOCK = text("SELECT pg_advisory_xact_lock(hashtextextended(:key,0))")


CREATE_SCHEDULE_INSERT_RECURRING_SCHEDULES = text("""INSERT INTO recurring_schedules(id,workspace_id,team_id,created_by,request_key,fingerprint,name,rule,template,due_after_minutes,next_run_at,created_at,updated_at)
        VALUES (:id,:workspace,:team,:actor,:key,:fingerprint,:name,CAST(:rule AS jsonb),CAST(:template AS jsonb),:due,:next,:now,:now)""")


UPDATE_SCHEDULE_UPDATE_RECURRING_SCHEDULES = text("""UPDATE recurring_schedules SET name=:name,rule=CAST(:rule AS jsonb),template=CAST(:template AS jsonb),due_after_minutes=:due,
        next_run_at=:next,version=version+1,updated_at=:now WHERE id=:id""")


SCHEDULE_COMMAND_INSERT_RECURRING_RUNS = text("""INSERT INTO recurring_runs(id,schedule_id,occurrence_key,scheduled_for,state,snapshot,created_at)
            VALUES (:run,:id,:key,:now,'QUEUED',CAST(:snapshot AS jsonb),:now)""")


SCHEDULE_COMMAND_UPDATE_RECURRING_SCHEDULES = text(
    "UPDATE recurring_schedules SET active=:active,version=version+1,updated_at=:now,next_run_at=:next,consecutive_failures=0 WHERE id=:id"
)


SCHEDULE_COMMAND_UPDATE_RECURRING_RUNS = text(
    "UPDATE recurring_runs SET state='CANCELED' WHERE schedule_id=:id AND state='QUEUED'"
)


PROCESS_SCHEDULE_UPDATE_RECURRING_RUNS = text(
    "UPDATE recurring_runs SET state=:state,error_code=:code,issue_id=:issue WHERE id=:id"
)


PROCESS_SCHEDULE_UPDATE_RECURRING_SCHEDULES = text("""UPDATE recurring_schedules SET next_run_at=:next,consecutive_failures=:failures,active=:active,
            version=version+CASE WHEN active<>:active THEN 1 ELSE 0 END,updated_at=:now WHERE id=:id""")


PROCESS_SCHEDULE_UPDATE_RECURRING_RUNS_2 = text(
    "UPDATE recurring_runs SET state='CANCELED' WHERE schedule_id=:id AND state='QUEUED'"
)


PROCESS_SCHEDULE_UPDATE_RECURRING_SCHEDULES_2 = text(
    "UPDATE recurring_schedules SET next_run_at=:next WHERE id=:id"
)


PROCESS_SCHEDULE_INSERT_RECURRING_RUNS = text("""INSERT INTO recurring_runs(id,schedule_id,occurrence_key,scheduled_for,state,snapshot,created_at)
                VALUES (:id,:schedule,:key,:due,'QUEUED',CAST(:snapshot AS jsonb),:now) ON CONFLICT(schedule_id,occurrence_key) DO NOTHING RETURNING id""")
