# Agent City - self-hosted pixel launcher
#
# Single-image build: compiles the React web client and the Fastify server,
# then serves both from one process on one port so `docker compose up -d`
# gives you a single URL to open.

FROM node:22-alpine AS web-build
WORKDIR /app/web
COPY apps/web/package*.json ./
RUN npm install
COPY apps/web/ ./
RUN npm run build

FROM node:22-alpine AS server-build
WORKDIR /app/server
COPY apps/server/package*.json ./
RUN npm install
COPY apps/server/ ./
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV AGENT_CITY_DATA_DIR=/app/data

COPY apps/server/package*.json ./
RUN npm install --omit=dev

COPY --from=server-build /app/server/dist ./dist
COPY --from=web-build /app/web/dist ./public

VOLUME ["/app/data"]
EXPOSE 3000

CMD ["node", "dist/index.js"]
