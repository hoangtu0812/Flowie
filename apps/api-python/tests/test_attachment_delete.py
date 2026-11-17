import asyncio
from types import SimpleNamespace

import pytest

from app.core.errors import ApiError
from app.modules.attachments import api as native_attachments

ROW = {'id': 'a1', 'workspace_id': 'w1', 'uploaded_by': 'u1', 'entity_type': 'issue', 'entity_id': 'i1', 'filename': 'old.pdf'}


class Db:
    """Answers the role lookup and the DELETE ... RETURNING; records every SQL text it runs.

    VI: Trả lời truy vấn role và DELETE ... RETURNING; ghi lại mọi câu SQL đã chạy.
    """

    def __init__(self, role='MEMBER', deleted_key='w1/u1/key-old.pdf'):
        self.role, self.deleted_key, self.sql, self.committed = role, deleted_key, [], False

    async def execute(self, statement, params=None):
        sql = str(statement)
        self.sql.append(sql)
        if 'DELETE FROM attachments' in sql:
            return SimpleNamespace(scalar_one_or_none=lambda: self.deleted_key)
        if 'INSERT INTO audit_logs' in sql:
            return SimpleNamespace()
        if 'SELECT * FROM attachments' in sql:
            return SimpleNamespace(mappings=lambda: SimpleNamespace(first=lambda: ROW))
        return SimpleNamespace(scalar_one_or_none=lambda: self.role)

    async def commit(self):
        self.committed = True


def run(monkeypatch, db, user_id, fail_storage=False):
    deleted = []

    class Storage:
        def __init__(self, settings):
            pass

        async def delete(self, key):
            if fail_storage:
                raise ApiError(502, 'Could not delete attachment.', 'Bad Gateway')
            deleted.append(key)

    async def allowed(*args, **kwargs):
        return None

    monkeypatch.setattr(native_attachments, 'MinioStorage', Storage)
    monkeypatch.setattr(native_attachments, '_authorize_entity', allowed)
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(settings=None)))
    result = asyncio.run(native_attachments.delete_attachment('a1', request, {'id': user_id}, db))
    return result, deleted


def test_uploader_deletes_row_audit_and_object(monkeypatch):
    db = Db()
    result, deleted = run(monkeypatch, db, 'u1')
    assert result == {'data': {'id': 'a1', 'deleted': True}}
    assert deleted == ['w1/u1/key-old.pdf'] and db.committed
    assert any('INSERT INTO audit_logs' in sql for sql in db.sql)


@pytest.mark.parametrize('role, allowed', [('MEMBER', False), ('ADMIN_VIEWER', False), ('ADMIN', True), ('OWNER', True)])
def test_other_users_need_owner_or_admin(monkeypatch, role, allowed):
    db = Db(role=role)
    if allowed:
        assert run(monkeypatch, db, 'u2')[1] == ['w1/u1/key-old.pdf']
        return
    with pytest.raises(ApiError) as raised:
        run(monkeypatch, db, 'u2')
    assert raised.value.status_code == 403
    assert not any('DELETE FROM attachments' in sql for sql in db.sql)


def test_storage_failure_or_concurrent_delete_never_commits(monkeypatch):
    db = Db()
    with pytest.raises(ApiError) as raised:
        run(monkeypatch, db, 'u1', fail_storage=True)
    assert raised.value.status_code == 502 and not db.committed
    gone = Db(deleted_key=None)
    with pytest.raises(ApiError) as raised:
        run(monkeypatch, gone, 'u1')
    assert raised.value.status_code == 404 and not gone.committed
