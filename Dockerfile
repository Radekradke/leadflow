# ── build ────────────────────────────────────────────────────
FROM node:20-slim AS build
# openssl é exigido pelo engine do Prisma
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx prisma generate
RUN npm run build
# remove devDependencies para a imagem final ficar enxuta
RUN npm prune --omit=dev

# ── runtime ──────────────────────────────────────────────────
FROM node:20-slim AS runtime
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json

# Aplica migrações pendentes e sobe a API. migrate deploy é idempotente:
# só roda o que falta, seguro a cada restart.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
