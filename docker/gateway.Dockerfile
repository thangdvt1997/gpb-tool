# Build context: gốc repo (xem docker-compose.yml, mục gateway).
# Gateway là điểm vào duy nhất, chỉ lắng nghe 127.0.0.1:18080.
FROM nginx:1.27-alpine
COPY deploy/nginx/gateway.conf /etc/nginx/conf.d/default.conf
RUN nginx -t
EXPOSE 18080
