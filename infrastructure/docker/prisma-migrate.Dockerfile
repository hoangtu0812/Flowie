# Prisma remains the schema owner while Flowie runs the Python API. This image
# is intentionally separate from the API runtime so every deployment can apply
# committed migrations before any application container accepts traffic.
FROM node:22-bookworm-slim

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/database/package.json ./packages/database/package.json
RUN pnpm install --filter @circle/database --frozen-lockfile

COPY packages/database/prisma ./packages/database/prisma

CMD ["pnpm", "--filter", "@circle/database", "exec", "prisma", "migrate", "deploy", "--schema", "prisma/schema.prisma"]
