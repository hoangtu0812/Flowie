import hashlib
import json
from pathlib import Path


def digest(path):
    value = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest()


def create(root, metadata):
    files = []
    for path in sorted(root.rglob("*")):
        if path.is_symlink():
            raise ValueError("Backup capture must not contain symbolic links.")
        if path.is_file():
            files.append(
                {
                    "path": path.relative_to(root).as_posix(),
                    "size": path.stat().st_size,
                    "sha256": digest(path),
                }
            )
    (root / "manifest.json").write_text(
        json.dumps({"format": 1, **metadata, "files": files}, indent=2), encoding="utf8"
    )
    return len(files)


def verify(root):
    if any(path.is_symlink() for path in root.rglob('*')):
        raise ValueError('Restored captures must not contain symbolic links.')
    manifests = list(root.rglob("manifest.json"))
    if len(manifests) != 1:
        raise ValueError("Restore must contain exactly one manifest.")
    manifest = manifests[0]
    data = json.loads(manifest.read_text(encoding="utf8"))
    if data.get("format") != 1 or not data.get("files"):
        raise ValueError("Unsupported or empty backup manifest.")
    base = manifest.parent.resolve()
    seen = set()
    for entry in data["files"]:
        relative = Path(entry["path"])
        if (
            relative.is_absolute()
            or ".." in relative.parts
            or relative.as_posix() in seen
        ):
            raise ValueError("Unsafe or duplicate manifest path.")
        path = base / relative
        if not path.resolve().is_relative_to(base) or path.is_symlink():
            raise ValueError("Manifest path escapes the restored capture.")
        seen.add(relative.as_posix())
        if path.stat().st_size != entry["size"] or digest(path) != entry["sha256"]:
            raise ValueError("Restored file integrity check failed.")
    actual = {
        path.relative_to(base).as_posix()
        for path in base.rglob("*")
        if path.is_file() and path != manifest
    }
    if actual != seen:
        raise ValueError("Restored capture contains unexpected files.")
    return data
