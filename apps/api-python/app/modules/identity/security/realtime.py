import asyncio

from fastapi import WebSocketDisconnect

from ....core.errors import ApiError
from ....services.notification_events import notification_hub
from ...access.projects import _workspace_access
from .sessions import active_identity, decode_access, expired


async def serve_notifications(socket, workspace, *, revalidate_interval=15):
    token = socket.cookies.get("flowie_access")
    if not token:
        await socket.close(code=4401)
        return
    factory = socket.app.state.session_factory

    async def check():
        claims = decode_access(token, socket.app.state.settings)
        async with factory() as db:
            user = await active_identity(db, claims)
            if user is None:
                raise expired()
            await _workspace_access(db, workspace, user["id"])
            return user["id"]

    try:
        user_id = await check()
    except ApiError as error:
        await socket.close(code=4403 if error.status_code == 403 else 4401)
        return
    await notification_hub.connect(workspace, user_id, socket)
    clock = asyncio.get_running_loop()
    checked = clock.time()
    messages = 0
    try:
        while True:
            try:
                message = await asyncio.wait_for(
                    socket.receive_text(),
                    max(0.01, revalidate_interval - (clock.time() - checked)),
                )
                messages += 1
                if messages > 60 or len(message) > 64:
                    await socket.close(code=1008)
                    return
            except TimeoutError:
                message = None
            if clock.time() - checked >= revalidate_interval:
                await check()
                checked = clock.time()
                messages = 0
            if message == "ping":
                await socket.send_text("pong")
    except WebSocketDisconnect:
        pass
    except ApiError as error:
        await socket.close(code=4403 if error.status_code == 403 else 4401)
    finally:
        notification_hub.disconnect(workspace, user_id, socket)
