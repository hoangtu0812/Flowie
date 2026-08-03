# ── Deps stage ──
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── Build stage ──
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# QUAN TRỌNG: NEXT_PUBLIC_* được Next nhúng thẳng vào bundle lúc BUILD, không
# đọc lúc chạy. Nên giá trị này phải là URL mà TRÌNH DUYỆT gọi được — tức
# http://localhost:8080, KHÔNG phải http://backend:8080 (tên service chỉ phân
# giải được bên trong mạng docker, trình duyệt của người dùng không thấy).
# Đổi giá trị => phải build lại image, đặt lại biến môi trường là vô ích.
ARG NEXT_PUBLIC_API_BASE=http://localhost:8080
ENV NEXT_PUBLIC_API_BASE=$NEXT_PUBLIC_API_BASE
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── Runtime stage ──
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup -g 10001 nodejs && adduser -D -u 10001 -G nodejs nextjs

# output:"standalone" sinh ra server.js cùng node_modules đã tỉa gọn.
COPY --from=build /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
