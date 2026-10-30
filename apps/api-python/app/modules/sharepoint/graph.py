"""Microsoft Graph calls for one-way SharePoint publishing.

Only two hosts are contacted, both fixed: login.microsoftonline.com for an app-only token
(client credentials) and graph.microsoft.com for site, drive and upload calls. Folder URLs
must be HTTPS on *.sharepoint.com, so a stored URL cannot point requests anywhere else.
The app needs the application permission Sites.Selected plus write access granted on the
target site; nothing broader is required.
VI: Các lời gọi Microsoft Graph để phát hành một chiều lên SharePoint. Chỉ gọi hai host cố
VI: định: login.microsoftonline.com để lấy token ứng dụng (client credentials) và
VI: graph.microsoft.com cho site, drive và upload. URL thư mục phải là HTTPS trên
VI: *.sharepoint.com, nên URL đã lưu không thể đưa request tới nơi khác. App cần quyền
VI: application Sites.Selected và được cấp quyền ghi trên đúng site đích; không cần quyền
VI: rộng hơn.
"""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import parse_qs, quote, unquote, urlparse

import httpx

GRAPH = "https://graph.microsoft.com/v1.0"
LOGIN = "https://login.microsoftonline.com"
TENANT_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9.-]{1,99}$")
# Characters SharePoint rejects in file and folder names.
# VI: Ký tự SharePoint không cho phép trong tên file và thư mục.
INVALID_NAME = re.compile(r'["*:<>?/\\|#%\x00-\x1f]')
# Largest body Graph accepts in a plain PUT; above it an upload session is required.
# VI: Kích thước lớn nhất Graph nhận qua PUT thường; lớn hơn phải dùng upload session.
SIMPLE_UPLOAD_BYTES = 4 * 1024 * 1024


class SharePointError(Exception):
    """A publishing failure whose message is safe to show to administrators.
    VI: Lỗi phát hành có thông báo an toàn để hiển thị cho quản trị viên."""


def safe_name(name: str) -> str:
    """A file or folder name SharePoint accepts: invalid characters become "-", and leading
    or trailing spaces and dots are removed. VI: Tên file/thư mục hợp lệ với SharePoint: ký tự
    không hợp lệ thành "-", bỏ khoảng trắng và dấu chấm ở đầu và cuối."""
    cleaned = INVALID_NAME.sub("-", name).strip(" .")
    return cleaned[:200] or "_"


def parse_folder_url(url: str) -> tuple[str, str, list[str]]:
    """Split a SharePoint folder URL into host, site path and the path below the site.

    Accepts a folder opened in the browser (`/sites/<site>/<library>/<folder>`) and the
    library view form `.../Forms/AllItems.aspx?id=<server-relative folder>`. Returns
    `(host, "/sites/<site>", [library, folder, ...])`.
    VI: Tách URL thư mục SharePoint thành host, đường dẫn site và phần đường dẫn dưới site.
    VI: Nhận URL thư mục mở trên trình duyệt (`/sites/<site>/<thư viện>/<thư mục>`) và dạng
    VI: xem thư viện `.../Forms/AllItems.aspx?id=<đường dẫn thư mục>`. Trả về
    VI: `(host, "/sites/<site>", [thư viện, thư mục, ...])`.
    """
    parsed = urlparse((url or "").strip())
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or not host.endswith(".sharepoint.com"):
        raise SharePointError("Use an https://<tenant>.sharepoint.com folder URL.")
    path = unquote(parsed.path)
    folder_id = parse_qs(parsed.query).get("id")
    if folder_id:
        path = unquote(folder_id[0])
    segments = [segment for segment in path.split("/") if segment]
    if len(segments) >= 2 and segments[-2].lower() == "forms" and segments[-1].lower().endswith(".aspx"):
        segments = segments[:-2]
    if len(segments) < 3 or segments[0].lower() not in {"sites", "teams"}:
        raise SharePointError(
            "Use a folder URL such as https://<tenant>.sharepoint.com/sites/<site>/<library>/<folder>."
        )
    return host, f"/{segments[0]}/{segments[1]}", segments[2:]


def _failure(response: httpx.Response, action: str) -> SharePointError:
    if response.status_code in (401, 403):
        return SharePointError(
            f"SharePoint refused {action}: grant the app Sites.Selected write access to this site."
        )
    if response.status_code == 404:
        return SharePointError(f"SharePoint could not find the site or folder while {action}.")
    return SharePointError(f"SharePoint returned HTTP {response.status_code} while {action}.")


class GraphClient:
    """App-only Graph client for one workspace connection; the token is fetched once.
    VI: Client Graph chỉ dùng quyền ứng dụng cho một kết nối workspace; token lấy một lần."""

    def __init__(self, http: httpx.AsyncClient, tenant_id: str, client_id: str, secret: str):
        if not TENANT_PATTERN.match(tenant_id):
            raise SharePointError("The tenant ID is not valid.")
        self.http, self.tenant_id, self.client_id, self.secret = http, tenant_id, client_id, secret
        self._token: str | None = None

    async def token(self) -> str:
        if self._token:
            return self._token
        response = await self.http.post(
            f"{LOGIN}/{self.tenant_id}/oauth2/v2.0/token",
            data={
                "grant_type": "client_credentials",
                "client_id": self.client_id,
                "client_secret": self.secret,
                "scope": "https://graph.microsoft.com/.default",
            },
        )
        if response.status_code != 200:
            raise SharePointError(
                "Microsoft sign-in failed: check the tenant ID, client ID and client secret."
            )
        self._token = response.json()["access_token"]
        return self._token

    async def _request(self, method: str, path: str, action: str, **options) -> dict[str, Any]:
        headers = {"authorization": f"Bearer {await self.token()}", **options.pop("headers", {})}
        response = await self.http.request(method, f"{GRAPH}{path}", headers=headers, **options)
        if response.status_code >= 300:
            raise _failure(response, action)
        return response.json()

    async def resolve_folder(self, url: str) -> dict[str, Any]:
        """Find the drive (document library) and folder path a folder URL points to.

        The site is read by its path, then the library is the drive whose web URL is the
        longest prefix of the folder URL; the remaining segments are the folder inside it.
        VI: Tìm drive (thư viện tài liệu) và đường dẫn thư mục mà URL trỏ tới. Site được đọc
        VI: theo đường dẫn, thư viện là drive có web URL là tiền tố dài nhất của URL thư mục;
        VI: các đoạn còn lại là thư mục bên trong thư viện.
        """
        host, site_path, rest = parse_folder_url(url)
        site = await self._request("GET", f"/sites/{host}:{quote(site_path)}", "reading the site")
        drives = await self._request(
            "GET", f"/sites/{site['id']}/drives?$select=id,name,webUrl", "listing libraries"
        )
        best: tuple[int, dict[str, Any]] | None = None
        lowered = [segment.lower() for segment in rest]
        for drive in drives.get("value", []):
            drive_path = [s for s in unquote(urlparse(drive.get("webUrl", "")).path).split("/") if s]
            library = [segment.lower() for segment in drive_path[2:]]
            if library and lowered[: len(library)] == library and (not best or len(library) > best[0]):
                best = (len(library), drive)
        if not best:
            raise SharePointError("The folder URL does not match a document library of that site.")
        folder = "/".join(rest[best[0] :])
        return {"driveId": best[1]["id"], "folderPath": folder, "library": best[1].get("name")}

    async def upload(
        self, drive_id: str, path: str, body: bytes, content_type: str = "text/markdown; charset=utf-8"
    ) -> dict[str, Any]:
        """Create or replace the file at `path` in the drive (missing folders are created).

        Graph accepts a plain PUT only up to 4 MB; larger bodies go through an upload session
        sent as one range, which Graph allows up to 60 MiB (attachments stop at 10 MB). The
        session URL comes from Graph and is pre-authenticated, so it gets no bearer token and
        must be HTTPS on *.sharepoint.com.
        VI: Tạo hoặc thay thế file tại `path` trong drive (thư mục thiếu sẽ được tạo). Graph chỉ
        VI: nhận PUT thường tới 4 MB; file lớn hơn đi qua upload session gửi trong một range, Graph
        VI: cho phép tới 60 MiB (attachment tối đa 10 MB). URL session do Graph trả về và đã kèm
        VI: xác thực, nên không gửi bearer token và URL phải là HTTPS trên *.sharepoint.com.
        """
        if len(body) <= SIMPLE_UPLOAD_BYTES:
            return await self._request(
                "PUT",
                f"/drives/{drive_id}/root:/{quote(path)}:/content",
                "uploading the file",
                content=body,
                headers={"content-type": content_type},
            )
        session = await self._request(
            "POST",
            f"/drives/{drive_id}/root:/{quote(path)}:/createUploadSession",
            "starting the upload",
            json={"item": {"@microsoft.graph.conflictBehavior": "replace"}},
        )
        target = urlparse(session.get("uploadUrl", ""))
        if target.scheme != "https" or not (target.hostname or "").lower().endswith(".sharepoint.com"):
            raise SharePointError("SharePoint returned an unexpected upload address.")
        response = await self.http.put(
            session["uploadUrl"],
            content=body,
            headers={"content-range": f"bytes 0-{len(body) - 1}/{len(body)}"},
        )
        if response.status_code >= 300:
            raise _failure(response, "uploading the file")
        return response.json()
