from ..work_items.issue_search import issue_scope


def scoped_sql(workspace, user, options):
    scope, params = issue_scope(workspace, user, options)
    return (
        """SELECT i.id,i.workspace_id,i.team_id,i.status_id,i.project_id,i.assignee_id,i.identifier,i.title,
        i.issue_type,i.created_at,i.due_date,i.start_date,i.estimated_effort,i.actual_effort,s.category::text AS category """
        + scope,
        params,
    )


def history_ctes(scope):
    # Visibility applies to both sides of historical team transitions, not just today's team.
    readable = """(e.to_team_id IS NULL OR EXISTS(SELECT 1 FROM teams et JOIN team_members etm ON etm.team_id=et.id
        WHERE et.id=e.to_team_id AND et.workspace_id=:workspace AND et.archived_at IS NULL AND etm.user_id=:user))
        AND (e.from_team_id IS NULL OR EXISTS(SELECT 1 FROM teams ft JOIN team_members ftm ON ftm.team_id=ft.id
        WHERE ft.id=e.from_team_id AND ft.workspace_id=:workspace AND ft.archived_at IS NULL AND ftm.user_id=:user))"""
    return (
        """WITH scoped AS ("""
        + scope
        + """), events AS (
        SELECT e.*,i.created_at AS issue_created_at,i.issue_type, ("""
        + readable
        + """) AS readable,
            (e.to_archived_at IS NULL AND e.to_category NOT IN ('COMPLETED','CANCELED') AND
                (e.from_category IN ('COMPLETED','CANCELED') OR e.from_archived_at IS NOT NULL)) AS starts_episode,
            (e.kind<>'BASELINE' AND e.to_category='COMPLETED' AND (e.kind='CREATED' OR e.from_category IS DISTINCT FROM 'COMPLETED')) AS completes
        FROM issue_lifecycle_events e JOIN scoped i ON i.id=e.issue_id
        WHERE e.occurred_at<=:now AND NOT e.managed_due AND
            (e.kind IN ('CREATED','BASELINE') OR e.from_status_id IS DISTINCT FROM e.to_status_id
            OR e.from_team_id IS DISTINCT FROM e.to_team_id OR e.from_archived_at IS DISTINCT FROM e.to_archived_at)
    ), ordered AS (
        SELECT e.*,SUM(CASE WHEN starts_episode THEN 1 ELSE 0 END) OVER(PARTITION BY issue_id ORDER BY issue_version) AS episode,
            LEAD(occurred_at) OVER(PARTITION BY issue_id ORDER BY issue_version) AS next_at FROM events e
    ), episodes AS (
        SELECT issue_id,episode,BOOL_AND(readable) AS readable,
            MIN(CASE WHEN kind='CREATED' THEN issue_created_at WHEN starts_episode THEN occurred_at END) AS opened_at,
            MIN(occurred_at) FILTER(WHERE kind<>'BASELINE' AND to_category='STARTED' AND (kind='CREATED' OR from_category IS DISTINCT FROM 'STARTED' OR starts_episode)) AS started_at,
            MIN(occurred_at) FILTER(WHERE completes) AS completed_at,BOOL_OR(completes AND readable) AS completion_visible
        FROM ordered GROUP BY issue_id,episode
    ), latest_entry AS (
        SELECT DISTINCT ON(issue_id) issue_id,to_status_id,occurred_at,readable,to_archived_at FROM ordered
        WHERE kind='CREATED' OR (kind<>'BASELINE' AND (from_status_id IS DISTINCT FROM to_status_id OR (from_archived_at IS NOT NULL AND to_archived_at IS NULL)))
        ORDER BY issue_id,issue_version DESC
    ), aging AS (
        SELECT i.id,EXTRACT(EPOCH FROM (:now-e.occurred_at)) AS seconds FROM scoped i
        LEFT JOIN latest_entry e ON e.issue_id=i.id AND e.to_status_id=i.status_id AND e.readable AND e.to_archived_at IS NULL
        WHERE i.category NOT IN ('COMPLETED','CANCELED')
    ), samples AS (
        SELECT *,CASE WHEN readable AND opened_at IS NOT NULL AND completed_at>=opened_at
            THEN EXTRACT(EPOCH FROM completed_at-opened_at) END AS lead_seconds,
            CASE WHEN readable AND opened_at IS NOT NULL AND started_at IS NOT NULL AND completed_at>=started_at
            THEN EXTRACT(EPOCH FROM completed_at-started_at) END AS cycle_seconds
        FROM episodes WHERE completion_visible AND completed_at>=:start AND completed_at<:until
    ), days AS (
        SELECT * FROM jsonb_to_recordset(CAST(:days AS jsonb)) AS d(day date,starts timestamp,ends timestamp,cutoff timestamp,complete boolean)
    ), creations AS (
        SELECT d.day,COUNT(i.id) AS created FROM days d LEFT JOIN scoped i ON i.created_at>=d.starts AND i.created_at<d.ends AND i.created_at<=:now GROUP BY d.day
    ), completions AS (
        SELECT d.day,COUNT(e.issue_id) AS completed FROM days d LEFT JOIN episodes e
            ON e.completion_visible AND e.completed_at>=d.starts AND e.completed_at<d.ends GROUP BY d.day
    ), observed AS (
        SELECT d.day,COUNT(e.issue_id) AS known,
            COUNT(e.issue_id) FILTER(WHERE e.to_category='STARTED' AND e.to_archived_at IS NULL) AS wip
        FROM days d LEFT JOIN ordered e ON e.readable AND e.occurred_at<=d.cutoff AND (e.next_at IS NULL OR e.next_at>d.cutoff) GROUP BY d.day
    ), existed AS (
        SELECT d.day,COUNT(i.id) AS total FROM days d LEFT JOIN scoped i ON i.created_at<=d.cutoff GROUP BY d.day
    ), trend AS (
        SELECT d.day::text AS day,c.created,f.completed,CASE WHEN d.cutoff IS NOT NULL THEN o.wip END AS wip,
            CASE WHEN d.cutoff IS NOT NULL THEN GREATEST(0,x.total-o.known) END AS unknown,
            d.complete FROM days d JOIN creations c USING(day) JOIN completions f USING(day) JOIN observed o USING(day) JOIN existed x USING(day) ORDER BY d.day
    ) """
    )
