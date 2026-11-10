"""The single path from Flowie to a workspace's AI provider.

VI: Lối duy nhất từ Flowie tới provider AI của workspace.
"""

from __future__ import annotations

import asyncio
import json
import logging
from time import monotonic
from typing import Any
from urllib.parse import urlsplit

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.clock import utcnow
from ...core.errors import ApiError
from ...core.identifiers import cuid
from .commands import (
    SAVE_INSERT_AI_PROVIDER_CALLS,
)

logger = logging.getLogger(__name__)

PROVIDER_LABELS = {'OPENAI': 'OpenAI', 'GOOGLE': 'Google'}
MAX_ATTEMPTS = 3
MAX_RETRY_DELAY_SECONDS = 10
RETRYABLE_STATUS = {429, 500, 502, 503, 504}
# Fields some models refuse. Reasoning models reject a custom temperature, and a gateway may reject
# a token limit above its model's maximum; the call still works without them.
# VI: Các trường một số model từ chối. Model reasoning không nhận temperature tuỳ chỉnh, gateway có
# VI: thể từ chối giới hạn token cao hơn mức của model; lời gọi vẫn chạy được khi bỏ chúng.
OPTIONAL_FIELDS = ('temperature', 'max_completion_tokens', 'max_tokens', 'maxOutputTokens')

# (read timeout in seconds, output token limit) per feature. Limits are generous because reasoning
# tokens count against them on some models; they stop a runaway reply, not a normal one.
# VI: (timeout đọc theo giây, giới hạn token output) theo tính năng. Giới hạn để rộng vì token
# VI: reasoning cũng bị tính ở một số model; mục tiêu là chặn câu trả lời mất kiểm soát.
CALL_LIMITS = {
    'agent.answer': (90, 4_000),
    'agent.assignment': (30, 2_000),
    'agent.compose': (60, 4_000),
    'agent.plan': (120, 16_000),
    'agent.report': (120, 8_000),
    'agent.schedule': (180, 24_000),
    'agent.test': (30, 1_000),
    'news.analysis': (180, 12_000),
    'servicedesk.answer': (60, 4_000),
}


def _openai_request(
    provider: dict[str, Any], system_prompt: str, history: list[dict[str, str]], max_output: int
) -> tuple[str, dict[str, str], dict[str, Any], dict[str, Any]]:
    # The official API deprecated max_tokens; OpenAI-compatible gateways generally expect it.
    # VI: API chính thức đã bỏ dần max_tokens; gateway tương thích OpenAI thường vẫn cần trường này.
    official = urlsplit(provider['endpoint']).hostname == 'api.openai.com'
    body = {
        'model': provider['model'],
        'messages': [{'role': 'system', 'content': system_prompt}, *history],
        'response_format': {'type': 'json_object'},
        'temperature': 0.2,
        'max_completion_tokens' if official else 'max_tokens': max_output,
    }
    url = f"{provider['endpoint'].rstrip('/')}/chat/completions"
    return url, {'Authorization': f"Bearer {provider['apiKey']}"}, body, body


def _google_request(
    provider: dict[str, Any], system_prompt: str, history: list[dict[str, str]], max_output: int
) -> tuple[str, dict[str, str], dict[str, Any], dict[str, Any]]:
    config = {'temperature': 0.2, 'responseMimeType': 'application/json', 'maxOutputTokens': max_output}
    body = {
        'systemInstruction': {'parts': [{'text': system_prompt}]},
        'contents': [
            {'role': 'model' if item['role'] == 'assistant' else 'user', 'parts': [{'text': item['content']}]}
            for item in history
        ],
        'generationConfig': config,
    }
    url = f"{provider['endpoint'].rstrip('/')}/models/{provider['model']}:generateContent"
    return url, {'x-goog-api-key': provider['apiKey']}, body, config


def _openai_reply(payload: dict[str, Any]) -> tuple[str, bool, int | None, int | None]:
    usage = payload.get('usage') or {}
    choice = payload['choices'][0]
    truncated = choice.get('finish_reason') == 'length'
    content = choice['message'].get('content')
    if not content and not truncated:
        raise KeyError('content')
    text_value = content if isinstance(content, str) else json.dumps(content)
    return text_value, truncated, usage.get('prompt_tokens'), usage.get('completion_tokens')


def _google_reply(payload: dict[str, Any]) -> tuple[str, bool, int | None, int | None]:
    usage = payload.get('usageMetadata') or {}
    candidate = payload['candidates'][0]
    truncated = candidate.get('finishReason') == 'MAX_TOKENS'
    parts = (candidate.get('content') or {}).get('parts') or []
    text_value = ''.join(part.get('text', '') for part in parts)
    if not text_value and not truncated:
        raise KeyError('text')
    return text_value, truncated, usage.get('promptTokenCount'), usage.get('candidatesTokenCount')


def _retry_delay(response: httpx.Response | None, attempt: int) -> float:
    try:
        requested = float(response.headers['retry-after']) if response is not None else None
    except (KeyError, ValueError):
        requested = None
    return min(requested if requested is not None else 2 * attempt - 1, MAX_RETRY_DELAY_SECONDS)


def _excerpt(body: str, api_key: str) -> str:
    # An error body may echo the request, so it is cut and the key removed before logging.
    # VI: Body lỗi có thể lặp lại request, nên được cắt ngắn và xoá key trước khi ghi log.
    return body.replace(api_key, '***')[:300] if api_key else body[:300]


async def _send(
    url: str,
    headers: dict[str, str],
    body: dict[str, Any],
    options: dict[str, Any],
    timeout: float,
    record: dict[str, Any],
) -> httpx.Response:
    """POST with retries for failures that can pass, and without fields the model refuses.

    A read timeout is not retried: the model may still be working, and the person is waiting.
    Dropping a refused field does not use up an attempt and can happen once per field.
    VI: POST có thử lại với lỗi có thể tự hết, và bỏ các trường model từ chối. Quá hạn khi đọc thì
    VI: không thử lại vì model có thể vẫn đang chạy và người dùng đang chờ. Bỏ trường bị từ chối
    VI: không tính vào số lần thử và xảy ra tối đa một lần cho mỗi trường.
    """
    async with httpx.AsyncClient(timeout=httpx.Timeout(timeout, connect=10)) as client:
        while True:
            record['attempts'] += 1
            response = None
            try:
                response = await client.post(url, headers=headers, json=body)
            except httpx.ReadTimeout:
                raise
            except httpx.HTTPError:
                if record['attempts'] >= MAX_ATTEMPTS:
                    raise
            if response is not None:
                if response.status_code == 400:
                    refused = next((name for name in OPTIONAL_FIELDS if name in options and name in response.text), None)
                    if refused:
                        del options[refused]
                        record['attempts'] -= 1
                        continue
                if response.status_code not in RETRYABLE_STATUS or record['attempts'] >= MAX_ATTEMPTS:
                    return response
            await asyncio.sleep(_retry_delay(response, record['attempts']))


async def _save(provider: dict[str, Any], feature: str, record: dict[str, Any], started: float) -> None:
    # A separate session keeps the row when the caller rolls back, which is when it matters most.
    # VI: Session riêng giữ được dòng này khi nơi gọi rollback, cũng là lúc nó có giá trị nhất.
    engine = provider.get('engine')
    if engine is None:
        return
    try:
        async with AsyncSession(engine) as db:
            await db.execute(
                SAVE_INSERT_AI_PROVIDER_CALLS,
                {
                    **record,
                    'id': cuid(),
                    'workspace_id': provider['workspaceId'],
                    'feature': feature,
                    'provider': provider['provider'],
                    'model': provider['model'],
                    'duration_ms': round((monotonic() - started) * 1000),
                    'now': utcnow(),
                },
            )
            await db.commit()
    except Exception:
        logger.warning('Could not record an AI provider call.', exc_info=True)


async def call_provider(
    provider: dict[str, Any], feature: str, system_prompt: str, history: list[dict[str, str]]
) -> str:
    """Send one completion and return its text, recording the outcome for AI operations.

    ``provider`` comes from ``configured_provider`` and ``feature`` must be a ``CALL_LIMITS`` key.
    No tools are ever sent, so the model can only answer with text. Every failure is an
    ``ApiError`` 502, and a reply cut off by the token limit is one too, so callers never try to
    parse half a JSON document.
    VI: Gửi một yêu cầu và trả văn bản, ghi kết quả cho AI operations. ``provider`` lấy từ
    VI: ``configured_provider``, ``feature`` là khoá của ``CALL_LIMITS``. Không bao giờ gửi tool nên
    VI: model chỉ trả lời được bằng văn bản. Mọi lỗi là ``ApiError`` 502, kể cả câu trả lời bị cắt do
    VI: giới hạn token, để nơi gọi không phải parse nửa tài liệu JSON.
    """
    timeout, max_output = CALL_LIMITS[feature]
    is_openai = provider['provider'] == 'OPENAI'
    build, read = (_openai_request, _openai_reply) if is_openai else (_google_request, _google_reply)
    label = PROVIDER_LABELS[provider['provider']]
    record: dict[str, Any] = {
        'outcome': 'error', 'status_code': None, 'input_tokens': None, 'output_tokens': None, 'attempts': 0,
    }
    started = monotonic()
    try:
        try:
            response = await _send(*build(provider, system_prompt, history, max_output), timeout, record)
        except httpx.ReadTimeout as error:
            record['outcome'] = 'timeout'
            raise ApiError(502, f'The {label} provider did not answer in time.', 'Bad Gateway') from error
        except httpx.HTTPError as error:
            raise ApiError(502, f'The {label} provider could not be reached.', 'Bad Gateway') from error
        record['status_code'] = response.status_code
        if response.is_error:
            logger.warning(
                'AI provider rejected a call: feature=%s provider=%s model=%s status=%s body=%s',
                feature, provider['provider'], provider['model'], response.status_code,
                _excerpt(response.text, provider['apiKey']),
            )
            raise ApiError(502, f'The {label} provider rejected the request (HTTP {response.status_code}).', 'Bad Gateway')
        try:
            reply, truncated, record['input_tokens'], record['output_tokens'] = read(response.json())
        except (ValueError, KeyError, IndexError, TypeError, AttributeError) as error:
            raise ApiError(502, f'The {label} provider returned no content.', 'Bad Gateway') from error
        if truncated:
            record['outcome'] = 'truncated'
            raise ApiError(502, f'The {label} reply was cut off before it finished. Please try a smaller request.', 'Bad Gateway')
        record['outcome'] = 'ok'
        return reply
    finally:
        await _save(provider, feature, record, started)
