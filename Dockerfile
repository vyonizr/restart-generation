FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY server server
COPY web web
USER node
EXPOSE 8080 8976
# --lan: listen on all interfaces inside the container. The published ports in compose.yaml decide who connects.
CMD ["node", "server/gateway.js", "--lan"]
