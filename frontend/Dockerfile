# フロントを Cloud Run に静的配信する場合用（Firebase Hosting を使うなら不要）
# gcloud run deploy teiki-frontend --source . --region asia-northeast1 --allow-unauthenticated
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/
COPY css /usr/share/nginx/html/css
COPY js /usr/share/nginx/html/js
COPY assets /usr/share/nginx/html/assets
EXPOSE 8080
