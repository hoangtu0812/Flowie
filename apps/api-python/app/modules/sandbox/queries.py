from sqlalchemy import text

ISSUE_WORKSPACE_SELECT_ISSUES = text('SELECT workspace_id FROM issues WHERE id=:id')
