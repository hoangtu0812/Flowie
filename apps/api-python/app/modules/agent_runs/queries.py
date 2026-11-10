"""Read SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL đọc của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import TextClause, text


def list_repositories_select_project_repositories_sql(policy) -> TextClause:
    return text(f"""SELECT r.id,r.project_id AS "projectId",r.name,r.repository_url AS "repositoryUrl",
        r.base_branch AS "baseBranch",r.test_commands AS "testCommands",r.instructions
        FROM project_repositories r JOIN projects p ON p.id=r.project_id
        WHERE r.workspace_id=:workspace AND (CAST(:project AS text) IS NULL OR r.project_id=:project)
        AND p.archived_at IS NULL AND {policy.team_clause("p.team_id", shared=True)}
        ORDER BY r.project_id,r.name,r.id LIMIT 500""")


REMOVE_REPOSITORY_SELECT_PROJECT_REPOSITORIES = text(
    "SELECT project_id FROM project_repositories WHERE id=:id AND workspace_id=:workspace"
)


OVERVIEW_SELECT_AUDIT_LOGS = text("""SELECT metadata->>'tool' AS tool,count(*)::int AS calls,
        count(*) FILTER(WHERE metadata->>'outcome'<>'succeeded')::int AS errors,
        percentile_cont(0.95) WITHIN GROUP(ORDER BY (metadata->>'durationMs')::int) AS "p95Ms"
        FROM audit_logs WHERE workspace_id=:workspace AND entity_type='mcp-tool' AND created_at>CAST(:now AS timestamp)-INTERVAL '24 hours'
        GROUP BY metadata->>'tool' ORDER BY count(*) DESC LIMIT 100""")


OVERVIEW_SELECT_AUDIT_LOGS_2 = text("""SELECT metadata->>'tool' AS tool,metadata->>'outcome' AS outcome,created_at AS "createdAt"
        FROM audit_logs WHERE workspace_id=:workspace AND entity_type='mcp-tool' AND metadata->>'outcome'<>'succeeded'
        ORDER BY created_at DESC LIMIT 25""")


OVERVIEW_SELECT_AI_TOOL_WINDOWS = text(
    "SELECT used FROM ai_tool_windows WHERE workspace_id=:workspace AND tool='*' AND window_start=date_trunc('minute',CAST(:now AS timestamp))"
)


OVERVIEW_SELECT_AI_PROVIDER_CALLS = text("""SELECT feature,count(*)::int AS calls,count(*) FILTER(WHERE outcome<>'ok')::int AS failed,
        COALESCE(sum(input_tokens),0)::bigint AS "inputTokens",COALESCE(sum(output_tokens),0)::bigint AS "outputTokens",
        percentile_cont(0.95) WITHIN GROUP(ORDER BY duration_ms) AS "p95Ms"
        FROM ai_provider_calls WHERE workspace_id=:workspace AND created_at>CAST(:now AS timestamp)-INTERVAL '7 days'
        GROUP BY feature ORDER BY COALESCE(sum(input_tokens),0)+COALESCE(sum(output_tokens),0) DESC""")


OVERVIEW_SELECT_AI_PROVIDER_CALLS_2 = text("""SELECT feature,outcome,status_code AS "statusCode",model,created_at AS "createdAt"
        FROM ai_provider_calls WHERE workspace_id=:workspace AND outcome<>'ok'
        ORDER BY created_at DESC LIMIT 10""")
