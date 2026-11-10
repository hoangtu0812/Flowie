"""Write SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL ghi của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import text

SAVE_INSERT_AI_PROVIDER_CALLS = text(
    '''INSERT INTO ai_provider_calls
                       (id, workspace_id, feature, provider, model, outcome, status_code, input_tokens,
                        output_tokens, attempts, duration_ms, created_at)
                       VALUES (:id, :workspace_id, :feature, :provider, :model, :outcome, :status_code,
                               :input_tokens, :output_tokens, :attempts, :duration_ms, :now)'''
)
