# The page is built in a first stage (ADR 0013), so the final image holds no node_modules.
FROM node:22-alpine AS page
WORKDIR /app
COPY package.json package-lock.json vite.config.mjs LICENSE THIRD_PARTY_NOTICES.md ./
RUN npm ci
COPY web web
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY package.json LICENSE THIRD_PARTY_NOTICES.md ./
COPY server server
# The plain modules the server imports (the bot engine, the game loader), and the built page.
COPY web/package.json web/snap.js web/zip.js web/
COPY web/emu web/emu
COPY web/tools web/tools
COPY --from=page /app/web/dist web/dist
USER node
EXPOSE 8080 8976
# --public: listen on all interfaces inside the container, with Discord sign-in if it is configured. Which ports are published
# decides who connects: compose.yaml publishes none (Caddy is in front), compose.lan.yaml runs it with --lan instead.
CMD ["node", "server/gateway.js", "--public"]
