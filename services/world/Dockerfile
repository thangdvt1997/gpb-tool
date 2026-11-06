# Build context: services/world. Không có SQLite nên không cần build tools.
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3011

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund \
    && npm cache clean --force

COPY src ./src

USER node
EXPOSE 3011

# Trạng thái chỉ nằm trong bộ nhớ: không có volume. Restart container làm mất presence (client tự gửi lại pose).
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/api/health" || exit 1

CMD ["node", "src/index.js"]
