FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build
COPY next.config.ts tsconfig.json next-env.d.ts postcss.config.mjs ./
COPY src ./src
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24-bookworm-slim AS frontend
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]

FROM dependencies AS backend-dependencies
RUN npm prune --omit=dev

FROM node:24-bookworm-slim AS backend
WORKDIR /app
ENV NODE_ENV=production BACKEND_HOST=0.0.0.0 PORT=4000
COPY --from=backend-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node backend ./backend
USER node
EXPOSE 4000
CMD ["node", "backend/server.mjs"]
