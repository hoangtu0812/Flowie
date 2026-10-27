from pathlib import Path

PROGRESS_LIMIT = 300
VERBS = {"Read": "Reading", "Edit": "Editing", "Write": "Writing"}


def one_line(text, limit=PROGRESS_LIMIT):
    """Collapse whitespace and cut to the length Flowie stores for run progress.
    VI: Gộp khoảng trắng và cắt theo độ dài Flowie lưu cho tiến độ run."""
    flat = " ".join(str(text).split())
    return flat if len(flat) <= limit else flat[: limit - 1] + "…"


def describe_claude_event(event, root):
    """Turn one Claude Code stream-json event into a progress line, or None.

    Tool calls become "Editing apps/web/x.ts" or "Searching for pattern" with paths made
    relative to the run worktree ``root``, so local directories do not reach the server;
    the model's own narration is passed through as a single line. Results, system events
    and anything unrecognized return None and leave the current line in place.
    VI: Chuyển một sự kiện stream-json của Claude Code thành một dòng tiến độ, hoặc None.
    VI: Lệnh gọi tool thành "Editing apps/web/x.ts" hoặc "Searching for pattern", đường dẫn
    VI: được đổi thành tương đối so với worktree ``root`` để thư mục máy local không lên
    VI: server; lời mô tả của model được giữ thành một dòng. Kết quả, sự kiện hệ thống và
    VI: những gì không nhận ra trả về None, giữ nguyên dòng hiện tại.
    """
    if not isinstance(event, dict) or event.get("type") != "assistant":
        return None
    message = event.get("message")
    content = message.get("content") if isinstance(message, dict) else None
    line = None
    for item in content if isinstance(content, list) else []:
        if not isinstance(item, dict):
            continue
        if item.get("type") == "text" and str(item.get("text", "")).strip():
            line = one_line(item["text"])
        elif item.get("type") == "tool_use":
            name, arguments = item.get("name"), item.get("input") or {}
            if name in VERBS and arguments.get("file_path"):
                line = f"{VERBS[name]} {_relative(arguments['file_path'], root)}"
            elif name == "Grep":
                line = one_line(f"Searching for {arguments.get('pattern', '')}")
            elif name == "Glob":
                line = one_line(f"Finding files {arguments.get('pattern', '')}")
            elif name:
                line = f"Using {name}"
    return line


def _relative(path, root):
    try:
        return Path(path).resolve().relative_to(Path(root).resolve()).as_posix()
    except (ValueError, OSError):
        return Path(path).name
