# Backend Gimnasio

Node + Express + Prisma 7 (TypeScript, ESM). Módulos: auth, clientes, membresías, pagos, instructores/bonos.

## Desarrollo local (sin Docker)

1. Levanta un Postgres local (o usa `docker compose up db -d`).
2. `cp .env.example .env` y ajusta `DATABASE_URL`.
3. `pnpm install`
pnpm add -D prisma
4. `pnpm generate` — genera el cliente Prisma en `src/generated/prisma`.
5. `pnpm migrate` — crea las tablas (te pedirá un nombre para la migración).
6. `pnpm seed` — crea el usuario admin inicial (revisa la consola para ver el password).
7. `pnpm dev` — levanta la API en `http://localhost:3000`.

## Con Docker (todo junto)

```bash
docker compose up --build
```

Luego, dentro del contenedor `api` (o localmente apuntando al `DATABASE_URL` del compose):

```bash
docker compose exec api pnpm prisma migrate deploy
docker compose exec api pnpm seed
```

## Login

```
POST /auth/login
{ "email": "admin@gimnasio.com", "password": "admin1234" }
```

Devuelve un `token` JWT. Úsalo como `Authorization: Bearer <token>` en el resto de rutas.

## Roles

- `ADMIN`: todo, incluida creación de instructores y bonos.
- `RECEPCION`: clientes, membresías, pagos.
- `INSTRUCTOR`: solo lectura por ahora (rutas de solo `GET`).

## Despliegue en Railway

1. Crea un proyecto nuevo en Railway y conecta este repo (o el subdirectorio, si vive junto al frontend).
2. Agrega un plugin de **PostgreSQL** — Railway inyecta `DATABASE_URL` automáticamente al servicio.
3. En el servicio del backend, agrega las variables: `JWT_SECRET`, `FRONTEND_URL` (tu URL de GitHub Pages), `NODE_ENV=production`.
4. Railway detecta el `Dockerfile` solo (o usa `railway.json`, ya incluido). Cada deploy corre `prisma migrate deploy` automáticamente antes de levantar el servidor — no necesitas ejecutar migraciones a mano.
5. Railway te da una URL pública tipo `https://tu-servicio.up.railway.app` — esa es la que usarás en el frontend (`VITE_API_GIMNASIO_URL`).
6. Corre el seed una sola vez desde la consola/CLI de Railway: `railway run pnpm seed`.

## Notas de arquitectura

- Crear una membresía (`POST /membresias`) NO registra el pago — son dos pasos separados a propósito, para no acoplar "dar de alta" con "cobrar".
- Registrar un pago (`POST /pagos`) sí reactiva la membresía (`estado: ACTIVA`) dentro de una transacción, para que nunca quede un pago sin su efecto reflejado.
- Los clientes se desactivan (soft delete), nunca se borran, para no perder el historial de pagos.
