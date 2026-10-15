import logging
import os
import re
import time
import uuid

from fastapi.responses import JSONResponse
from ...core.audit_context import audit_source

logger=logging.getLogger('flowie.requests')


def build_identity():
    revision=os.getenv('FLOWIE_REVISION','local')
    return {'revision':revision if re.fullmatch(r'[a-f0-9]{7,40}|local',revision) else 'unknown'}


def install_diagnostics(app):
    if not logger.handlers:
        logger.addHandler(logging.StreamHandler())
    logger.setLevel(logging.INFO)
    logger.propagate=False
    @app.middleware('http')
    async def request_context(request,call_next):
        supplied=request.headers.get('x-request-id','')
        reference=supplied if re.fullmatch(r'[A-Za-z0-9_-]{1,64}',supplied) else uuid.uuid4().hex
        request.state.request_id=reference
        started=time.monotonic()
        source_token=audit_source.set('AI' if request.url.path.startswith('/mcp') else 'WEB')
        try:
            response=await call_next(request)
        except Exception as error:
            logger.error('request_failed reference=%s category=%s',reference,type(error).__name__)
            response=JSONResponse(status_code=500,content={'message':'The request could not be completed.','requestId':reference})
        finally:
            audit_source.reset(source_token)
        response.headers['x-request-id']=reference
        response.headers['x-flowie-revision']=build_identity()['revision']
        route=getattr(request.scope.get('route'),'path','unmatched')
        logger.info('request_complete reference=%s method=%s route=%s status=%s duration_ms=%s',
            reference,request.method,route,response.status_code,round((time.monotonic()-started)*1000))
        return response
