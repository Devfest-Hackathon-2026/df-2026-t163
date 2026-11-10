# gcloud run deploy teiki-backend --source backend --region asia-northeast1 --allow-unauthenticated \
#   --set-env-vars GOOGLE_CLOUD_PROJECT=<PROJECT_ID>,GOOGLE_CLOUD_LOCATION=global \
#   --set-secrets MAPS_API_KEY=maps-api-key:latest
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Cloud Run は PORT 環境変数でポートを渡してくる
CMD exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}
