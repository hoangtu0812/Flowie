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


# Stream-JSON events can embed whole file contents, so a line may exceed asyncio's 64 KiB
# default buffer.
# VI: Sự kiện stream-JSON có thể chứa nguyên nội dung file nên một dòng có thể vượt bộ đệm
# VI: 64 KiB mặc định của asyncio.
STREAM_LINE_LIMIT = 16 * 1024 * 1024


async def _stream_lines(process, stdin, on_line):
    if stdin is not None:
        process.stdin.write(stdin.encode("utf-8"))
        await process.stdin.drain()
        process.stdin.close()
    async for raw in process.stdout:
        on_line(raw.decode("utf-8", errors="replace").rstrip("\r\n"))
    await process.wait()


async def run_process(
    argv, cwd, timeout, *, stdin=None, capture=False, merge_errors=False, on_line=None
):
    """Run a child process with a hard timeout.

    With ``on_line`` the child's stdout is delivered line by line as it is written and
    the returned output is empty: the caller keeps whatever it needs from the stream.
    VI: Chạy tiến trình con với timeout cứng. Khi có ``on_line``, stdout của tiến trình
    VI: được chuyển từng dòng ngay khi ghi ra và output trả về rỗng: bên gọi tự giữ phần
    VI: cần dùng từ luồng đó.
    """
    options = (
        {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP}
        if os.name == "nt"
        else {"start_new_session": True}
    )
    if on_line is not None:
        capture, options["limit"] = True, STREAM_LINE_LIMIT
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
        if on_line is not None:
            await asyncio.wait_for(_stream_lines(process, stdin, on_line), timeout=timeout)
            return process.returncode, ""
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
