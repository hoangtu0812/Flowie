"""The single path from Flowie to a workspace's AI provider.

VI: Lối duy nhất từ Flowie tới provider AI của workspace.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from collections.abc import Callable
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
    'agent.ask': (90, 4_000),
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


def _openai_messages(history: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Neutral turns to Chat Completions messages; see ``call_provider_with_tools`` for the shape.
    VI: Chuyển lượt hội thoại trung lập sang message Chat Completions; dạng xem ở ``call_provider_with_tools``.
    """
    messages: list[dict[str, Any]] = []
    for item in history:
        if item['role'] == 'tool':
            messages.append({'role': 'tool', 'tool_call_id': item['id'], 'content': item['content']})
        elif item.get('toolCalls'):
            messages.append({
                'role': 'assistant',
                'content': item.get('content') or None,
                'tool_calls': [
                    {'id': call['id'], 'type': 'function',
                     'function': {'name': call['name'], 'arguments': json.dumps(call['arguments'] or {})}}
                    for call in item['toolCalls']
                ],
            })
        else:
            messages.append({'role': item['role'], 'content': item['content']})
    return messages


def _openai_tools_request(
    provider: dict[str, Any], system_prompt: str, history: list[dict[str, Any]], tools: list[dict[str, Any]], max_output: int
) -> tuple[str, dict[str, str], dict[str, Any], dict[str, Any]]:
    url, headers, body, options = _openai_request(provider, system_prompt, [], max_output)
    # Free text, not JSON mode: the final answer is Markdown and tool arguments carry their own JSON.
    # VI: Văn bản tự do, không dùng JSON mode: câu trả lời cuối là Markdown, tham số tool đã là JSON.
    del body['response_format']
    body['messages'] = [body['messages'][0], *_openai_messages(history)]
    body['tools'] = [{'type': 'function', 'function': tool} for tool in tools]
    return url, headers, body, options


def _openai_tools_reply(payload: dict[str, Any]) -> tuple[dict[str, Any], bool, int | None, int | None]:
    usage = payload.get('usage') or {}
    choice = payload['choices'][0]
    message = choice['message']
    calls = []
    for call in message.get('tool_calls') or []:
        try:
            arguments = json.loads(call['function'].get('arguments') or '{}')
        except ValueError:
            arguments = None
        calls.append({
            'id': call['id'], 'name': call['function']['name'],
            'arguments': arguments if isinstance(arguments, dict) else None,
        })
    content = message.get('content')
    text_value = content if isinstance(content, str) else ''
    truncated = choice.get('finish_reason') == 'length'
    if not calls and not text_value and not truncated:
        raise KeyError('content')
    return {'text': text_value, 'toolCalls': calls}, truncated, usage.get('prompt_tokens'), usage.get('completion_tokens')


def _google_contents(history: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Neutral turns to Gemini contents. Results of one round of calls share one user turn, and a
    call's ``signature`` (Gemini's thoughtSignature) goes back unchanged, which thinking models require.
    VI: Chuyển lượt hội thoại trung lập sang contents Gemini. Kết quả của một lượt gọi chung một lượt
    VI: user, và ``signature`` (thoughtSignature của Gemini) được gửi lại nguyên vẹn như model thinking yêu cầu.
    """
    contents: list[dict[str, Any]] = []
    for item in history:
        if item['role'] == 'tool':
            part = {'functionResponse': {'name': item['name'], 'response': {'content': item['content']}}}
            if contents and contents[-1]['role'] == 'user' and 'functionResponse' in contents[-1]['parts'][0]:
                contents[-1]['parts'].append(part)
            else:
                contents.append({'role': 'user', 'parts': [part]})
        elif item.get('toolCalls'):
            contents.append({'role': 'model', 'parts': [
                {'functionCall': {'name': call['name'], 'args': call['arguments'] or {}},
                 **({'thoughtSignature': call['signature']} if call.get('signature') else {})}
                for call in item['toolCalls']
            ]})
        else:
            contents.append({'role': 'model' if item['role'] == 'assistant' else 'user', 'parts': [{'text': item['content']}]})
    return contents


def _google_tools_request(
    provider: dict[str, Any], system_prompt: str, history: list[dict[str, Any]], tools: list[dict[str, Any]], max_output: int
) -> tuple[str, dict[str, str], dict[str, Any], dict[str, Any]]:
    url, headers, body, config = _google_request(provider, system_prompt, [], max_output)
    del config['responseMimeType']
    body['contents'] = _google_contents(history)
    body['tools'] = [{'functionDeclarations': [
        {'name': tool['name'], 'description': tool['description'], 'parametersJsonSchema': tool['parameters']}
        for tool in tools
    ]}]
    return url, headers, body, config


def _google_tools_reply(payload: dict[str, Any]) -> tuple[dict[str, Any], bool, int | None, int | None]:
    usage = payload.get('usageMetadata') or {}
    candidate = payload['candidates'][0]
    parts = (candidate.get('content') or {}).get('parts') or []
    calls = [
        {'id': f'call_{index}', 'name': part['functionCall']['name'], 'arguments': part['functionCall'].get('args') or {},
         'signature': part.get('thoughtSignature')}
        for index, part in enumerate(parts) if 'functionCall' in part
    ]
    text_value = ''.join(part.get('text', '') for part in parts if not part.get('thought'))
    truncated = candidate.get('finishReason') == 'MAX_TOKENS'
    if not calls and not text_value and not truncated:
        raise KeyError('text')
    return {'text': text_value, 'toolCalls': calls}, truncated, usage.get('promptTokenCount'), usage.get('candidatesTokenCount')


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


class ToolsUnsupported(ApiError):
    """The provider or gateway refused a request because of its tools; callers fall back to text.
    VI: Provider hoặc gateway từ chối request vì phần tools; nơi gọi chuyển sang luồng văn bản.
    """


async def _complete(
    provider: dict[str, Any],
    feature: str,
    request: tuple[str, dict[str, str], dict[str, Any], dict[str, Any]],
    read: Callable[[dict[str, Any]], tuple[Any, bool, int | None, int | None]],
    *,
    tools: bool = False,
) -> Any:
    timeout = CALL_LIMITS[feature][0]
    label = PROVIDER_LABELS[provider['provider']]
    record: dict[str, Any] = {
        'outcome': 'error', 'status_code': None, 'input_tokens': None, 'output_tokens': None, 'attempts': 0,
    }
    started = monotonic()
    try:
        try:
            response = await _send(*request, timeout, record)
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
            # A model or gateway without function calling answers 400/422 naming tools or functions, or a
            # bare 404: LiteLLM in front of an Azure deployment returns "Resource not found" for a request
            # with tools while the same model answers text calls, so a 404 here is never a reason to fail.
            # If the model itself is missing, the text fallback then reports the 404 on its own call.
            # VI: Model hoặc gateway không hỗ trợ function calling trả 400/422 có nhắc tới tools/functions,
            # VI: hoặc chỉ trả 404: LiteLLM trước deployment Azure trả "Resource not found" cho request có
            # VI: tools trong khi cùng model vẫn trả lời lời gọi văn bản, nên 404 ở đây không làm hỏng lượt hỏi.
            # VI: Nếu chính model không tồn tại, lời gọi văn bản dự phòng sẽ tự báo 404 của nó.
            if tools and (
                response.status_code == 404
                or (response.status_code in {400, 422} and re.search(r'tool|function', response.text, re.IGNORECASE))
            ):
                raise ToolsUnsupported(502, f'The {label} model does not accept tools.', 'Bad Gateway')
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


async def call_provider(
    provider: dict[str, Any], feature: str, system_prompt: str, history: list[dict[str, str]]
) -> str:
    """Send one completion and return its text, recording the outcome for AI operations.

    ``provider`` comes from ``configured_provider`` and ``feature`` must be a ``CALL_LIMITS`` key.
    No tools are sent, so the model can only answer with text. Every failure is an
    ``ApiError`` 502, and a reply cut off by the token limit is one too, so callers never try to
    parse half a JSON document.
    VI: Gửi một yêu cầu và trả văn bản, ghi kết quả cho AI operations. ``provider`` lấy từ
    VI: ``configured_provider``, ``feature`` là khoá của ``CALL_LIMITS``. Không gửi tool nên
    VI: model chỉ trả lời được bằng văn bản. Mọi lỗi là ``ApiError`` 502, kể cả câu trả lời bị cắt do
    VI: giới hạn token, để nơi gọi không phải parse nửa tài liệu JSON.
    """
    max_output = CALL_LIMITS[feature][1]
    if provider['provider'] == 'OPENAI':
        return str(await _complete(provider, feature, _openai_request(provider, system_prompt, history, max_output), _openai_reply))
    return str(await _complete(provider, feature, _google_request(provider, system_prompt, history, max_output), _google_reply))


async def call_provider_with_tools(
    provider: dict[str, Any],
    feature: str,
    system_prompt: str,
    history: list[dict[str, Any]],
    tools: list[dict[str, Any]],
) -> dict[str, Any]:
    """One step of a function-calling loop: returns ``{'text': str, 'toolCalls': [...]}``.

    ``tools`` are ``{'name', 'description', 'parameters'}`` with a JSON Schema. ``history`` holds
    neutral turns: ``{'role': 'user'|'assistant', 'content'}``, an assistant turn with
    ``toolCalls`` (``{'id', 'name', 'arguments', 'signature'?}`` exactly as returned here; arguments
    are None when the model sent invalid JSON) and ``{'role': 'tool', 'id', 'name', 'content'}`` per
    result. Retries, limits and the ``ai_provider_calls`` record are those of ``call_provider``; a
    provider that refuses tools raises ``ToolsUnsupported``.
    VI: Một bước của vòng lặp function calling, trả ``{'text': str, 'toolCalls': [...]}``. ``tools``
    VI: gồm ``{'name', 'description', 'parameters'}`` với JSON Schema. ``history`` là các lượt trung lập:
    VI: ``{'role': 'user'|'assistant', 'content'}``, lượt assistant có ``toolCalls`` (đúng như hàm này
    VI: trả về; arguments là None khi model gửi JSON sai) và ``{'role': 'tool', 'id', 'name', 'content'}``
    VI: cho từng kết quả. Thử lại, giới hạn và bản ghi ``ai_provider_calls`` giống ``call_provider``;
    VI: provider từ chối tools thì ném ``ToolsUnsupported``.
    """
    max_output = CALL_LIMITS[feature][1]
    if provider['provider'] == 'OPENAI':
        request = _openai_tools_request(provider, system_prompt, history, tools, max_output)
        return dict(await _complete(provider, feature, request, _openai_tools_reply, tools=True))
    request = _google_tools_request(provider, system_prompt, history, tools, max_output)
    return dict(await _complete(provider, feature, request, _google_tools_reply, tools=True))
