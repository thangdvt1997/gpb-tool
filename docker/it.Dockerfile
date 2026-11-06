# Build context: services/it (xem docker-compose.yml, mục it).
# Loại node_modules và data của máy host bằng docker/it.Dockerfile.dockerignore (BuildKit).
# mock/ được copy vào image cùng toàn bộ mã nguồn.
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3002 \
    DATA_DIR=/data

# libstdc++ là thư viện runtime của better-sqlite3. Cài riêng để không bị gỡ cùng build tools.
RUN apk add --no-cache libstdc++

# Build tools chỉ cần khi better-sqlite3 phải biên dịch từ mã nguồn.
# Cài tạm và gỡ trong cùng một lệnh RUN để không nằm lại trong image.
COPY package.json package-lock.json* ./
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
    && npm install --omit=dev --no-audit --no-fund \
    && npm cache clean --force \
    && apk del .build-deps

COPY . .

# Thư mục dữ liệu thuộc user node. Named volume it-data kế thừa quyền này khi được tạo lần đầu.
RUN mkdir -p /data && chown -R node:node /data

VOLUME ["/data"]
USER node
EXPOSE 3002

# Entry point theo "start" trong services/it/package.json.
CMD ["node", "src/index.js"]
