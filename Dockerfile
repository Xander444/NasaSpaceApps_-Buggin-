FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000 \
    SIMULATOR_MAX_CONCURRENT=2

WORKDIR /app
COPY requirements.txt ./
RUN python -m pip install --no-cache-dir -r requirements.txt
COPY simulator ./simulator

EXPOSE 8000
CMD ["sh", "-c", "uvicorn api:app --app-dir simulator --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]

