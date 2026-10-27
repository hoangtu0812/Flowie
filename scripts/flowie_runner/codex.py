import json
from pathlib import Path
import tempfile

from .process import run_process
from .prompt import (
    REVIEW_SCHEMA,
    SUMMARY_SCHEMA,
    checked_review,
    checked_summary,
    review_prompt,
    task_prompt,
)


class CodexProvider:
    async def doctor(self, config):
        code, help_text = await run_process(
            [config.codex, "exec", "--help"], config.repository_path, 30, capture=True
        )
        required = [
            "--sandbox",
            "--ephemeral",
            "--ignore-user-config",
            "--output-last-message",
            "--output-schema",
        ]
        if code or any(flag not in help_text for flag in required):
            raise RuntimeError(
                "Update Codex CLI: required sandbox/output flags are unavailable."
            )
        code, _ = await run_process(
            [config.codex, "login", "status"], config.repository_path, 30
        )
        if code:
            raise RuntimeError("Sign in to Codex CLI before starting local work.")

    async def review(self, config, context, path):
        # Read-only sandbox: the review must not change files before its plan is recorded.
        # VI: Sandbox chỉ đọc: bước review không được sửa file trước khi ghi kế hoạch.
        output = await self._run(
            config, path, review_prompt(context), REVIEW_SCHEMA, "read-only"
        )
        return checked_review(output, "Codex")

    async def execute(self, config, context, path):
        output = await self._run(
            config, path, task_prompt(context), SUMMARY_SCHEMA, "workspace-write"
        )
        return checked_summary(output, "Codex")

    async def _run(self, config, path, prompt, schema_value, sandbox):
        with tempfile.TemporaryDirectory(prefix="flowie-codex-") as directory:
            output = Path(directory) / "result.json"
            schema = Path(directory) / "schema.json"
            schema.write_text(json.dumps(schema_value), encoding="utf-8")
            code, _ = await run_process(
                [
                    config.codex,
                    "exec",
                    "--sandbox",
                    sandbox,
                    "--ignore-user-config",
                    "--ephemeral",
                    "--output-schema",
                    str(schema),
                    "--output-last-message",
                    str(output),
                    "--cd",
                    str(path),
                    "-",
                ],
                path,
                config.command_timeout,
                stdin=prompt,
            )
            if code:
                raise RuntimeError(
                    "Codex failed; local work was preserved for inspection."
                )
            if not output.exists() or output.stat().st_size > 20000:
                raise RuntimeError("Codex returned no bounded result.")
            return json.loads(output.read_text(encoding="utf-8"))
