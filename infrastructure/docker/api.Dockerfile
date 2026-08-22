FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/database/package.json packages/database/package.json
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
COPY apps/api apps/api
COPY packages/config packages/config
COPY packages/contracts packages/contracts
COPY packages/database packages/database
RUN pnpm --filter @circle/contracts build && pnpm --filter @circle/database generate && pnpm --filter @circle/api build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/packages/database ./packages/database
EXPOSE 4000
CMD ["node", "apps/api/dist/main.js"]
