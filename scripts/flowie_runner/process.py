import asyncio
import os
import shutil
import subprocess


def child_environment():
    # Auth remains in the existing Codex/Claude home (USER unlocks the macOS keychain);
    # Flowie and SCM tokens never enter children.
    allowed = {
        "PATH",
        "PATHEXT",
        "SYSTEMROOT",
        "WINDIR",
        "COMSPEC",
        "HOME",
        "USERPROFILE",
        "APPDATA",
        "LOCALAPPDATA",
        "TEMP",
        "TMP",
        "CODEX_HOME",
        "CLAUDE_CONFIG_DIR",
        "USER",
        "LOGNAME",
        "LANG",
        "LC_ALL",
    }
    return {key: value for key, value in os.environ.items() if key.upper() in allowed}


def resolve_executable(program):
    # CreateProcess only appends .exe when searching PATH, so a bare name cannot reach
    # an npm shim such as claude.CMD on Windows. A PATHEXT-aware lookup keeps the
    # documented configuration values portable across hosts.
    resolved = shutil.which(program)
    if not resolved:
        raise RuntimeError("A configured executable was not found on PATH.")
    return resolved


async def stop_process(process):
    if process.returncode is not None:
        return
    if os.name == "nt":
        killer = await asyncio.create_subprocess_exec(
            "taskkill",
            "/PID",
            str(process.pid),
            "/T",
            "/F",
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        await killer.wait()
    else:
        import signal

        os.killpg(process.pid, signal.SIGTERM)
    try:
        await asyncio.wait_for(process.wait(), timeout=5)
    except TimeoutError:
        if os.name != "nt":
            os.killpg(process.pid, signal.SIGKILL)
        else:
            process.kill()
        await process.wait()


async def run_process(argv, cwd, timeout, *, stdin=None, capture=False, merge_errors=False):
    options = (
        {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP}
        if os.name == "nt"
        else {"start_new_session": True}
    )
    program, *arguments = argv
    process = await asyncio.create_subprocess_exec(
        resolve_executable(program),
        *arguments,
        cwd=str(cwd),
        env=child_environment(),
        stdin=asyncio.subprocess.PIPE if stdin is not None else subprocess.DEVNULL,
        stdout=asyncio.subprocess.PIPE if capture else subprocess.DEVNULL,
        # Approved tests report their diagnostics, so their stderr joins the captured
        # stream; a provider's stderr stays out of the stream that carries its result.
        stderr=asyncio.subprocess.STDOUT
        if capture and merge_errors
        else subprocess.DEVNULL,
        **options,
    )
    try:
        output, _ = await asyncio.wait_for(
            process.communicate(stdin.encode("utf-8") if stdin is not None else None),
            timeout=timeout,
        )
        return process.returncode, output.decode(
            "utf-8", errors="replace"
        ).strip() if output else ""
    except BaseException:
        await stop_process(process)
        raise
