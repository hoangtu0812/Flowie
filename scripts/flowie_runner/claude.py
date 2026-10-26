import json

from .process import run_process
from .prompt import SUMMARY_SCHEMA, checked_summary, task_prompt

# File tools only: the parent runner owns shell, test, git and network side effects.
TOOLS = "Read,Edit,Write,Glob,Grep"
REQUIRED_FLAGS = [
    "--print",
    "--output-format",
    "--json-schema",
    "--permission-mode",
    "--permission-prompts",
    "--tools",
    "--restricted",
    "--strict-mcp-config",
    "--no-session-persistence",
]


class ClaudeProvider:
    async def doctor(self, config):
        code, help_text = await run_process(
            [config.claude, "--help"], config.repository_path, 30, capture=True
        )
        if code or any(flag not in help_text for flag in REQUIRED_FLAGS):
            raise RuntimeError(
                "Update Claude Code: required permission/output flags are unavailable."
            )
        code, status = await run_process(
            [config.claude, "auth", "status", "--json"],
            config.repository_path,
            30,
            capture=True,
        )
        try:
            logged_in = not code and json.loads(status).get("loggedIn") is True
        except ValueError:
            logged_in = False
        if not logged_in:
            raise RuntimeError("Sign in to Claude Code before starting local work.")

    async def execute(self, config, context):
        # --restricted ignores user/project settings and confines file tools to the
        # checkout; --permission-prompts none denies anything acceptEdits would ask.
        code, output = await run_process(
            [
                config.claude,
                "--print",
                "--output-format",
                "json",
                "--json-schema",
                json.dumps(SUMMARY_SCHEMA),
                "--permission-mode",
                "acceptEdits",
                "--permission-prompts",
                "none",
                "--tools",
                TOOLS,
                "--restricted",
                "--strict-mcp-config",
                "--no-session-persistence",
            ],
            config.repository_path,
            config.command_timeout,
            stdin=task_prompt(context),
            capture=True,
        )
        if code:
            raise RuntimeError(
                "Claude Code failed; local work was preserved for inspection."
            )
        if not output or len(output) > 200000:
            raise RuntimeError("Claude Code returned no bounded result.")
        value = json.loads(output)
        if value.get("is_error") or value.get("subtype") != "success":
            raise RuntimeError("Claude Code did not finish the task.")
        return checked_summary(value.get("structured_output"), "Claude Code")
