# The page is built in a first stage (ADR 0013), so the final image holds no node_modules.
FROM node:22-alpine AS page
WORKDIR /app
COPY package.json package-lock.json vite.config.mjs LICENSE THIRD_PARTY_NOTICES.md ./
# vite.config.mjs takes the gateway's HTTP port from server/ports.js.
COPY server/ports.js server/
RUN npm ci
COPY web web
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY package.json LICENSE THIRD_PARTY_NOTICES.md ./
COPY server server
# The plain modules the server imports (the bot engine, the game loader), and the built page.
COPY web/package.json web/snap.js web/snap-ids.js web/zip.js web/replay-text.js web/
COPY web/emu web/emu
COPY web/tools web/tools
COPY --from=page /app/web/dist web/dist
USER node
EXPOSE 8080 8976
# The release the server reports in /status (ADR 0019). The image has no .git, so compose passes it in (compose.yaml).
ARG RG_VERSION=unknown
ENV RG_VERSION=$RG_VERSION
# --public: listen on all interfaces inside the container, with Discord sign-in if it is configured. Which ports are published
# decides who connects: compose.yaml publishes none (Caddy is in front), compose.lan.yaml runs it with --lan instead.
CMD ["node", "server/gateway.js", "--public"]
