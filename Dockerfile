# API とフロントを 1 つの Cloud Run サービスで動かす（同じオリジンなので CORS 不要）
# デプロイ手順は backend/README.md
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 FRONTEND_DIR=/app/frontend
WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
COPY frontend/index.html ./frontend/
COPY frontend/css ./frontend/css
COPY frontend/js ./frontend/js
COPY frontend/assets ./frontend/assets

# Cloud Run は PORT 環境変数でポートを渡してくる
CMD exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}
