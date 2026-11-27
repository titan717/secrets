FROM node:20-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile=false
COPY . .
RUN pnpm build && pnpm prune --prod

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8791
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
EXPOSE 8791
USER node
CMD ["node", "dist/index.js"]
