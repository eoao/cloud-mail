FROM node:22-alpine

WORKDIR /app
COPY package.json ./
COPY bin ./bin
COPY lib ./lib

# No dependencies to install - the bridge uses only Node built-ins.

ENV IMAP_PORT=1143 \
    SMTP_PORT=1587 \
    BIND_HOST=0.0.0.0

EXPOSE 1143 1587

USER node

CMD ["node", "bin/cloud-mail-bridge.mjs"]
