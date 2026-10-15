import re

from fastapi import Response


def private_download(content, media_type, filename):
    if not re.fullmatch(r"[a-zA-Z0-9_.-]+", filename):
        raise ValueError("Download filenames must be static safe names")
    return Response(
        content,
        media_type=media_type,
        headers={
            "content-disposition": f'attachment; filename="{filename}"',
            "cache-control": "private, no-store",
            "x-content-type-options": "nosniff",
        },
    )
