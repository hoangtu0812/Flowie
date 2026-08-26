FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/database/package.json packages/database/package.json
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
ARG NEXT_PUBLIC_API_URL
ARG UI_BUILD_REVISION=local
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN printf '%s' "$UI_BUILD_REVISION" > /tmp/ui-build-revision
COPY apps/web apps/web
COPY packages/contracts packages/contracts
# next.config.ts reads the release version and date from here; without it the
# built image cannot tell anyone which release it is running.
COPY CHANGELOG.md ./CHANGELOG.md
RUN pnpm --filter @circle/web build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/web/.next ./apps/web/.next
COPY --from=build /app/apps/web/node_modules ./apps/web/node_modules
# Retain assets at both the process root and the Next project root. `next start apps/web`
# resolves public files from the latter, while the former keeps direct runtime invocations safe.
COPY --from=build /app/apps/web/public ./public
COPY --from=build /app/apps/web/public ./apps/web/public
COPY --from=build /app/apps/web/package.json ./apps/web/package.json
EXPOSE 3000
CMD ["node", "apps/web/node_modules/next/dist/bin/next", "start", "apps/web"]
