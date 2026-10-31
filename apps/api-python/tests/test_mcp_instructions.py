import re

from app.modules.mcp.registry import TOOLS
from app.modules.mcp.instructions import INSTRUCTIONS_PREAMBLE, server_instructions
from app.modules.mcp.transport import SERVER_INSTRUCTIONS


def test_workflow_instructions_name_only_registered_tools():
    # Field names such as `targetDate` are camelCase, so this pattern only picks tool names.
    named = set(re.findall(r"`([a-z_]+)`", SERVER_INSTRUCTIONS))
    assert named, "the workflow should name the tools agents must call"
    assert named <= set(TOOLS), sorted(named - set(TOOLS))
    for step in (
        "add_comment", "transition_issue", "upsert_feature_doc", "get_feature_docs", "update_issue",
        "start_issue", "finish_issue",
    ):
        assert step in named


def test_custom_workflow_keeps_the_fixed_preamble():
    assert SERVER_INSTRUCTIONS.startswith(INSTRUCTIONS_PREAMBLE + "\n\n")
    assert server_instructions("") == SERVER_INSTRUCTIONS
    custom = server_instructions("Only comment.")
    assert custom == INSTRUCTIONS_PREAMBLE + "\n\nOnly comment."
