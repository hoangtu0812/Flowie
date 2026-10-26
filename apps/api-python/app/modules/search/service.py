from __future__ import annotations

import unicodedata
from sqlalchemy import text
from ...core.pagination import CursorCodec, literal_search
from ..access.membership import _workspace_role
from ..access.project_scope import project_read_scope
from ..work_items.issue_search import VIETNAMESE, NORMALIZED

SOURCES = f"""
SELECT 'issue' AS kind,i.id,i.title,i.identifier AS subtitle,'/issue/'||i.identifier AS path,i.created_at,i.title||' '||COALESCE(i.description,'') AS search_text
FROM issues i LEFT JOIN teams t ON t.id=i.team_id WHERE i.workspace_id=:workspace AND i.archived_at IS NULL AND t.archived_at IS NULL
AND (i.team_id IS NULL OR EXISTS(SELECT 1 FROM team_members tm WHERE tm.team_id=i.team_id AND tm.user_id=:user))
UNION ALL
SELECT 'document',d.id,d.title,'Document','/documents/'||d.id,d.created_at,d.title||' '||d.content
FROM documents d WHERE d.workspace_id=:workspace AND d.archived_at IS NULL
AND (d.team_id IS NULL OR EXISTS(SELECT 1 FROM teams t JOIN team_members tm ON tm.team_id=t.id WHERE t.id=d.team_id AND t.archived_at IS NULL AND tm.user_id=:user))
UNION ALL
SELECT 'project',p.id,p.name,COALESCE(p.identifier,'Project'),'/project/'||p.id||'/overview',p.created_at,p.name||' '||COALESCE(p.description,'')
FROM projects p WHERE {project_read_scope()}
UNION ALL
SELECT 'member',u.id,u.name,'Member','/profiles/'||u.id,u.created_at,u.name
FROM workspace_members wm JOIN users u ON u.id=wm.user_id WHERE wm.workspace_id=:workspace AND wm.status='ACTIVE' AND u.status='ACTIVE'
"""


async def search(
    db, workspace, user, secret, query, *, kind=None, limit=25, cursor=None
):
    await _workspace_role(db, workspace, user)
    normalized = "".join(
        "d" if char == "đ" else char
        for char in unicodedata.normalize("NFD", query.lower())
        if not unicodedata.combining(char)
    ).strip()
    if not normalized:
        return {"data": [], "meta": {"limit": limit, "nextCursor": None}}
    codec = CursorCodec(
        secret,
        user,
        "workspace-search",
        {"workspace": workspace, "query": normalized, "kind": kind},
    )
    params = {
        "workspace": workspace,
        "user": user,
        "pattern": literal_search(normalized),
        "accents": VIETNAMESE,
        "normalized": NORMALIZED,
        "kind": kind,
        "limit": limit + 1,
    }
    after = ""
    if cursor:
        timestamp, identifier = codec.decode(cursor)
        params.update(after_time=timestamp, after_id=identifier)
        after = "AND (r.created_at,r.kind||':'||r.id)<(:after_time,:after_id)"
    rows = (
        (
            await db.execute(
                text(f"""SELECT r.kind,r.id,r.title,r.subtitle,r.path,r.created_at FROM ({SOURCES}) r
        WHERE translate(lower(r.search_text),:accents,:normalized) ILIKE :pattern ESCAPE '\\'
        AND (CAST(:kind AS text) IS NULL OR r.kind=CAST(:kind AS text)) {after}
        ORDER BY r.created_at DESC,r.kind||':'||r.id DESC LIMIT :limit"""),
                params,
            )
        )
        .mappings()
        .all()
    )
    selected = rows[:limit]
    return {
        "data": [
            {key: r[key] for key in ["kind", "id", "title", "subtitle", "path"]}
            for r in selected
        ],
        "meta": {
            "limit": limit,
            "nextCursor": codec.encode(
                selected[-1]["created_at"],
                selected[-1]["kind"] + ":" + selected[-1]["id"],
            )
            if len(rows) > limit
            else None,
        },
    }
