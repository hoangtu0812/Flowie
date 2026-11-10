"""Write SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL ghi của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import text

RETRY_JOB_UPDATE_ISSUE_SLA_JOBS = text(
    "UPDATE issue_sla_jobs SET generation=generation+1,attempts=0,failed_at=NULL,last_error_code=NULL,next_attempt_at=:now WHERE issue_id=:id"
)


PROCESS_ALERTS_UPDATE_ISSUE_SLA_CYCLES = text(
    """UPDATE issue_sla_cycles SET breach_sent_at=:now,escalation_code=:code,escalated_at=:applied,alert_results=CAST(:results AS jsonb) WHERE id=:id"""
)


PROCESS_ALERTS_UPDATE_ISSUE_SLA_CYCLES_2 = text(
    "UPDATE issue_sla_cycles SET warning_sent_at=:now,alert_results=CAST(:results AS jsonb) WHERE id=:id"
)


INSERT_CYCLE_INSERT_ISSUE_SLA_CYCLES = text("""INSERT INTO issue_sla_cycles(id,issue_id,workspace_id,cycle,policy_id,policy_version,snapshot,state,budget_seconds,remaining_seconds,last_started_at,due_at,warning_at,started_at,closed_at)
        VALUES (:id,:issue,:workspace,:cycle,:policy,:version,CAST(:snapshot AS jsonb),:state,:budget,:remaining,:last,:due,:warning,:now,:closed)""")


SAVE_CYCLE_UPDATE_ISSUE_SLA_CYCLES = text("""UPDATE issue_sla_cycles SET state=:state,remaining_seconds=:remaining_seconds,last_started_at=:last_started_at,
        due_at=:due_at,warning_at=:warning_at,closed_at=:closed_at,breached_at=:breached_at WHERE id=:id""")


RESCHEDULE_INSERT_ISSUE_SLA_JOBS = text("""INSERT INTO issue_sla_jobs(issue_id,next_attempt_at) VALUES (:id,:next)
        ON CONFLICT(issue_id) DO UPDATE SET next_attempt_at=EXCLUDED.next_attempt_at,generation=issue_sla_jobs.generation+1,attempts=0,last_error_code=NULL,failed_at=NULL""")


RESCHEDULE_UPDATE_ISSUE_SLA_JOBS = text(
    "UPDATE issue_sla_jobs SET next_attempt_at=NULL,generation=generation+1,attempts=0,last_error_code=NULL,failed_at=NULL WHERE issue_id=:id"
)


RECORD_FAILURE_UPDATE_ISSUE_SLA_JOBS = text("""UPDATE issue_sla_jobs SET attempts=:attempts,last_error_code=:code,next_attempt_at=:next,failed_at=:failed
                WHERE issue_id=:id AND generation=:generation""")


REVISION_INSERT_SLA_POLICY_REVISIONS = text(
    "INSERT INTO sla_policy_revisions(policy_id,version,kind,snapshot,actor_id,created_at) VALUES (:id,:version,:kind,CAST(:snapshot AS jsonb),:actor,:now)"
)


CREATE_POLICY_LOCK = text("SELECT pg_advisory_xact_lock(hashtextextended(:key,0))")


CREATE_POLICY_INSERT_SLA_POLICIES = text("""INSERT INTO sla_policies(id,workspace_id,created_by,name,description,team_id,priority,deadline_minutes,enabled,calendar,pause_status_ids,warning_minutes,escalate_to_id,created_at,updated_at)
        VALUES (:id,:workspace,:actor,:name,:description,:teamId,:priority,:deadlineMinutes,:enabled,CAST(:calendar AS jsonb),:pauseStatusIds,:warningMinutes,:escalateToId,:now,:now)""")


UPDATE_POLICY_LOCK = text("SELECT pg_advisory_xact_lock(hashtextextended(:key,0))")


UPDATE_POLICY_UPDATE_SLA_POLICIES = text("""UPDATE sla_policies SET name=:name,description=:description,team_id=:teamId,priority=:priority,deadline_minutes=:deadlineMinutes,
        enabled=:enabled,calendar=CAST(:calendar AS jsonb),pause_status_ids=:pauseStatusIds,warning_minutes=:warningMinutes,escalate_to_id=:escalateToId,version=version+1,updated_at=:now WHERE id=:id""")


POLICY_COMMAND_LOCK = text("SELECT pg_advisory_xact_lock(hashtextextended(:key,0))")


POLICY_COMMAND_UPDATE_SLA_POLICIES = text(
    "UPDATE sla_policies SET archived_at=:archived,version=version+1,updated_at=:now WHERE id=:id"
)


REAPPLY_POLICY_UPDATE_ISSUES = text("UPDATE issues SET sla_opt_out=false WHERE id=:id")


REAPPLY_POLICY_UPDATE_ISSUE_LIFECYCLE_EVENTS = text(
    "UPDATE issue_lifecycle_events SET sla_processed_at=:now WHERE issue_id=:id AND sla_processed_at IS NULL AND managed_due=true"
)


SYNC_ISSUE_UPDATE_ISSUE_LIFECYCLE_EVENTS = text(
    "UPDATE issue_lifecycle_events SET sla_processed_at=:now WHERE id=:id"
)


SYNC_ISSUE_UPDATE_ISSUE_LIFECYCLE_EVENTS_2 = text(
    "UPDATE issue_lifecycle_events SET sla_processed_at=:now WHERE issue_id=:id AND sla_processed_at IS NULL AND managed_due=true"
)
