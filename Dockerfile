FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile
COPY . .
# prisma.config.ts necesita poder leer DATABASE_URL/DIRECT_URL para cargar,
# aunque "generate" no abre conexión real a la base. Los reales los pone
# Render en runtime — estos son solo para que el build no falle.
ENV DATABASE_URL="postgresql://user:pass@localhost:5432/db"
ENV DIRECT_URL="postgresql://user:pass@localhost:5432/db"
RUN pnpm prisma generate

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/src ./src
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/prisma.config.ts ./prisma.config.ts

EXPOSE 3000
# Corre con tsx (no con node dist/), porque el cliente Prisma 7 generado
# es TypeScript y está pensado para correr así, no compilado con tsc.
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node_modules/.bin/tsx src/index.ts"]
