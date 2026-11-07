# Build context: services/world. Không có SQLite nên không cần build tools.
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3011

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund \
    && npm cache clean --force

COPY src ./src

# Thư mục dữ liệu thuộc user node; named volume world-data kế thừa quyền này khi tạo lần đầu.
RUN mkdir -p /data && chown -R node:node /data
VOLUME ["/data"]

USER node
EXPOSE 3011

# Presence, lease, chat nằm trong bộ nhớ (restart làm mất, client tự gửi lại pose). Riêng vai trò phòng lưu ở WORLD_DATA_DIR (mount volume ghi được bởi user node nếu cần bền).
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/api/health" || exit 1

CMD ["node", "src/index.js"]
