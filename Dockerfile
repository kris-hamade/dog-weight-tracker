# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS build

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app /app

RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "server.js"]
