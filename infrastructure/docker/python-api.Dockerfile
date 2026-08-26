# syntax=docker/dockerfile:1
FROM python:3.12-slim AS runtime

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN useradd --create-home --uid 10001 flowie
COPY apps/api-python/requirements.txt ./requirements.txt
# The wheel cache lives in the builder, not in a layer, so the image stays as
# small as it was while a rebuild after a code-only change downloads nothing.
# The timeout and retries are for the deploy host's link to PyPI: a single slow
# read used to fail the whole release after eight minutes.
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --timeout 120 --retries 10 --requirement requirements.txt
COPY apps/api-python/app ./app

USER flowie
EXPOSE 4000
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "4000", "--proxy-headers"]
