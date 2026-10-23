# Image FE cho Kubernetes: build dist/ rồi phục vụ bằng Caddy (cổng 8080, không chạy root).
# Bước build chạy trên kiến trúc của máy build (BUILDPLATFORM), nên build amd64 + arm64 không phải giả lập Node.
# Caddy của cụm (repo backend, deploy/k8s) chuyển / sang Service fe, /api sang api: cùng origin (V38).
FROM --platform=$BUILDPLATFORM node:24-alpine AS build
WORKDIR /app
RUN npm install -g pnpm@11.1.3
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
# Mặc định gọi backend thật qua /api cùng origin. VITE_USE_MOCKS=true: bật MSW, dữ liệu giả, không gọi backend.
ARG VITE_GOOGLE_CLIENT_ID=
ARG VITE_USE_MOCKS=false
# Đường dẫn gốc của app: / cho bản chính, /mock/ cho bản mock (Caddy của cụm bỏ tiền tố trước khi chuyển vào).
ARG BASE_PATH=/
ENV VITE_USE_MOCKS=$VITE_USE_MOCKS VITE_API_BASE_URL= VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID BASE_PATH=$BASE_PATH
RUN pnpm build && find dist -name '*.map' -delete

FROM caddy:2.10-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
# Caddy không cần ghi /data, /config khi tắt admin và TLS; vẫn trỏ sang /tmp cho chắc.
ENV XDG_DATA_HOME=/tmp XDG_CONFIG_HOME=/tmp
USER 1000:1000
EXPOSE 8080
