FROM python:3.12-slim AS runtime

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN useradd --create-home --uid 10001 flowie
COPY apps/api-python/requirements.txt ./requirements.txt
RUN pip install --requirement requirements.txt
COPY apps/api-python/app ./app

USER flowie
EXPOSE 4000
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "4000", "--proxy-headers"]
