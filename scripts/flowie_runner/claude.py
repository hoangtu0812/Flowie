import json
import sys
from uuid import uuid4

from .process import run_process
from .progress import describe_claude_event
from .prompt import (
    REVIEW_SCHEMA,
    SUMMARY_SCHEMA,
    checked_review,
    checked_summary,
    review_prompt,
    task_prompt,
)

# File tools only: the parent runner owns shell, test, git and network side effects.
TOOLS = "Read,Edit,Write,Glob,Grep"
# The review step reads the checkout only; it must not change files before the plan
# and target end date are recorded.
# VI: Bước review chỉ đọc checkout; không được sửa file trước khi kế hoạch và ngày
# VI: kết thúc dự kiến được ghi nhận.
REVIEW_TOOLS = "Read,Glob,Grep"
REQUIRED_FLAGS = [
    "--print",
    "--output-format",
    "--verbose",
    "--json-schema",
    "--permission-mode",
    "--permission-prompts",
    "--tools",
    "--restricted",
    "--strict-mcp-config",
    "--session-id",
    "--name",
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

    async def review(self, config, context, path, progress=None):
        output = await self._run(
            config, context, path, review_prompt(context), REVIEW_SCHEMA,
            REVIEW_TOOLS, "default", progress,
        )
        return checked_review(output, "Claude Code")

    async def execute(self, config, context, path, progress=None):
        output = await self._run(
            config, context, path, task_prompt(context), SUMMARY_SCHEMA,
            TOOLS, "acceptEdits", progress,
        )
        return checked_summary(output, "Claude Code")

    async def _run(self, config, context, path, prompt, schema, tools, mode, progress):
        session = str(uuid4())
        identifier = str(context.get("issue", {}).get("identifier") or "run")[:50]
        # The transcript is kept so operators can follow or resume the session; stdout
        # stays reserved for the runner's JSON result. The path is the run's own
        # worktree, which a successful run removes once the branch holds the commit.
        print(
            f"Claude Code session {session}: claude --resume {session}"
            f" in {path}",
            file=sys.stderr,
            flush=True,
        )
        # stream-json reports each step while it happens; only the final "result" event
        # is kept, and every other event becomes at most one progress line.
        # VI: stream-json báo từng bước ngay khi diễn ra; chỉ giữ sự kiện "result" cuối,
        # VI: các sự kiện khác thành tối đa một dòng tiến độ.
        final = {}

        def on_line(line):
            try:
                event = json.loads(line)
            except ValueError:
                return
            if isinstance(event, dict) and event.get("type") == "result":
                final["value"] = event
            elif progress and (text := describe_claude_event(event, path)):
                progress(text)

        # --restricted ignores user/project settings and confines file tools to the
        # checkout; --permission-prompts none denies anything acceptEdits would ask.
        code, _ = await run_process(
            [
                config.claude,
                "--print",
                "--output-format",
                "stream-json",
                "--verbose",
                "--json-schema",
                json.dumps(schema),
                "--permission-mode",
                mode,
                "--permission-prompts",
                "none",
                "--tools",
                tools,
                "--restricted",
                "--strict-mcp-config",
                "--session-id",
                session,
                "--name",
                f"Flowie {identifier}",
            ],
            path,
            config.command_timeout,
            stdin=prompt,
            on_line=on_line,
        )
        if code:
            raise RuntimeError(
                "Claude Code failed; local work was preserved for inspection."
            )
        value = final.get("value")
        if value is None:
            raise RuntimeError("Claude Code returned no result.")
        if value.get("is_error") or value.get("subtype") != "success":
            raise RuntimeError("Claude Code did not finish the task.")
        return value.get("structured_output")
