import json
from pathlib import Path
import tempfile

from .process import run_process
from .prompt import SUMMARY_SCHEMA, checked_summary, task_prompt


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

    async def execute(self, config, context, path):
        with tempfile.TemporaryDirectory(prefix="flowie-codex-") as directory:
            output = Path(directory) / "result.json"
            schema = Path(directory) / "schema.json"
            schema.write_text(json.dumps(SUMMARY_SCHEMA), encoding="utf-8")
            code, _ = await run_process(
                [
                    config.codex,
                    "exec",
                    "--sandbox",
                    "workspace-write",
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
                stdin=task_prompt(context),
            )
            if code:
                raise RuntimeError(
                    "Codex failed; local work was preserved for inspection."
                )
            if not output.exists() or output.stat().st_size > 20000:
                raise RuntimeError("Codex returned no bounded result.")
            return checked_summary(
                json.loads(output.read_text(encoding="utf-8")), "Codex"
            )
