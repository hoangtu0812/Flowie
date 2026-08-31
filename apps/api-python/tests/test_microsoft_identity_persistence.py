from __future__ import annotations

import asyncio
import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import _async_database_url
from app.domains.auth import _cuid, _upsert_microsoft_user
from app.services.microsoft_identity import MicrosoftProfile


class MicrosoftIdentityPersistenceTests(unittest.TestCase):
    @unittest.skipUnless(os.getenv('SCM_TEST_DATABASE_URL'), 'SCM_TEST_DATABASE_URL is not configured')
    def test_microsoft_identity_is_idempotent_and_creates_a_workspace(self) -> None:
        async def run() -> None:
            engine = create_async_engine(
                _async_database_url(os.environ['SCM_TEST_DATABASE_URL'])
            )
            async with engine.connect() as connection:
                transaction = await connection.begin()
                db = AsyncSession(bind=connection, expire_on_commit=False)
                try:
                    unique = _cuid()
                    email = f'{unique}@example.invalid'
                    settings = SimpleNamespace(admin_email=email)
                    profile = MicrosoftProfile(
                        object_id=unique,
                        tenant_id='11111111-1111-1111-1111-111111111111',
                        email=email,
                        name='Azure Managed User',
                    )

                    user_id = await _upsert_microsoft_user(
                        db, profile, timezone_name='UTC', settings=settings
                    )
                    second_id = await _upsert_microsoft_user(
                        db,
                        MicrosoftProfile(
                            object_id=profile.object_id,
                            tenant_id=profile.tenant_id,
                            email=email,
                            name='Azure Renamed User',
                        ),
                        timezone_name='UTC',
                        settings=settings,
                    )

                    self.assertEqual(user_id, second_id)
                    result = await db.execute(
                        text(
                            '''SELECT u.name, u.is_platform_admin,
                                      (SELECT COUNT(*) FROM user_identities i WHERE i.user_id = u.id) AS identities,
                                      (SELECT COUNT(*) FROM workspace_members m WHERE m.user_id = u.id) AS memberships
                               FROM users u WHERE u.id = :id'''
                        ),
                        {'id': user_id},
                    )
                    row = result.mappings().one()
                    self.assertEqual(row['name'], 'Azure Renamed User')
                    self.assertTrue(row['is_platform_admin'])
                    self.assertEqual(row['identities'], 1)
                    self.assertEqual(row['memberships'], 1)
                finally:
                    await db.close()
                    await transaction.rollback()
            await engine.dispose()

        asyncio.run(run())


if __name__ == '__main__':
    unittest.main()
