FROM node:22-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY Backend/package.json Backend/package.json
COPY Frontend/package.json Frontend/package.json

RUN npm ci

COPY . .

RUN npm run build

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production

WORKDIR /app

COPY package.json package-lock.json ./
COPY Backend/package.json Backend/package.json
COPY Frontend/package.json Frontend/package.json

RUN npm ci --omit=dev

COPY --from=builder /app/Backend/dist Backend/dist
COPY --from=builder /app/Backend/.env.example Backend/.env.example

EXPOSE 3000

CMD ["node", "Backend/dist/server.js"]
