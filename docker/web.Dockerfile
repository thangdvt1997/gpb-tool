# Build context: gốc repo (xem docker-compose.yml, mục web).
# Stage 1: build bản tĩnh bằng Vite. Stage 2: nginx phục vụ thư mục dist.
# Không copy services/, server/, docs/ vào image; .dockerignore ở gốc đã loại chúng khỏi context.

FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY tsconfig.json vite.config.ts index.html ./
COPY public ./public
COPY src ./src
RUN npm run build

FROM nginx:1.27-alpine
COPY deploy/nginx/web.conf /etc/nginx/conf.d/default.conf
RUN nginx -t
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 18081
