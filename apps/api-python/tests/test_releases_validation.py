"""Release input is validated before anything is written.
VI: Dữ liệu release được kiểm trước khi ghi bất cứ thứ gì.
"""
import pytest
from pydantic import ValidationError

from app.modules.releases.api import CreateReleaseInput, UpdateReleaseInput


def test_a_well_formed_release_is_accepted():
    release = CreateReleaseInput(
        workspaceId="w1", name="Autumn launch", version="2026.08", status="in-progress",
        targetDate="2026-08-31", projectIds=["p1", "p2"],
    )
    assert release.status == "in-progress"
    assert CreateReleaseInput(workspaceId="w1", name="Next", version="1").status == "planned"


def test_an_invalid_name_version_and_status_are_all_reported():
    with pytest.raises(ValidationError) as error:
        CreateReleaseInput(workspaceId="w1", name="x", version="", status="shipping")
    assert {issue["loc"][0] for issue in error.value.errors()} >= {"name", "version", "status"}
    with pytest.raises(ValidationError):
        UpdateReleaseInput(status="shipping")
