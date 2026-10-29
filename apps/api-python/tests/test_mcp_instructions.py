import re

from app.modules.mcp.registry import TOOLS
from app.modules.mcp.transport import SERVER_INSTRUCTIONS


def test_workflow_instructions_name_only_registered_tools():
    # Field names such as `targetDate` are camelCase, so this pattern only picks tool names.
    named = set(re.findall(r"`([a-z_]+)`", SERVER_INSTRUCTIONS))
    assert named, "the workflow should name the tools agents must call"
    assert named <= set(TOOLS), sorted(named - set(TOOLS))
    for step in ("add_comment", "transition_issue", "upsert_feature_doc", "get_feature_docs", "update_issue"):
        assert step in named
