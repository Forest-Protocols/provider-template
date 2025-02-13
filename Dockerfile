FROM node:22-bookworm

# Install dotenvx
RUN curl -sfS https://dotenvx.sh/install.sh | sh

USER node

WORKDIR /daemon

COPY --chown=node:node package*.json .
COPY --chown=node:node . .

RUN npm ci
RUN npm run build

CMD ["bash", "/daemon/start.sh"]