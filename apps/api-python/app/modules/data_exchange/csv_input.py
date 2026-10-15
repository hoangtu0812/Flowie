import csv
from io import StringIO

from ...core.errors import ApiError
from .contracts import IMPORT_FIELDS


def parse_csv(content):
    if len(content.encode("utf8")) > 2 * 1024 * 1024 or "\x00" in content:
        raise ApiError(
            400, "CSV must be UTF-8 text without NUL, at most 2 MB.", "Bad Request"
        )
    try:
        reader = csv.reader(
            StringIO(content.removeprefix("\ufeff"), newline=""), strict=True
        )
        headers = next(reader)
        if (
            not 2 <= len(headers) <= 50
            or any(not value.strip() or len(value) > 100 for value in headers)
            or len(set(headers)) != len(headers)
        ):
            raise ValueError("headers")
        rows = []
        for values in reader:
            if not values or all(not value.strip() for value in values):
                continue
            if len(values) != len(headers) or len(rows) >= 1000:
                raise ValueError("rows")
            rows.append(dict(zip(headers, values)))
        if not rows:
            raise ValueError("empty")
        return headers, rows
    except (csv.Error, ValueError, StopIteration) as error:
        raise ApiError(
            400,
            "Use unique non-empty column headers and 1–1000 rows with matching columns.",
            "Bad Request",
        ) from error


def validate_mapping(headers, mapping):
    if (
        set(mapping) - set(IMPORT_FIELDS)
        or not {"externalId", "title"} <= set(mapping)
        or any(value not in headers for value in mapping.values())
        or len(set(mapping.values())) != len(mapping)
    ):
        raise ApiError(
            400,
            "Map title and externalId once each; every mapped column must exist.",
            "Bad Request",
        )
