# Backend Gimnasio

Node + Express + Prisma 7 (TypeScript, ESM). Módulos: auth, clientes, membresías, pagos, instructores/bonos.

## Desarrollo local (sin Docker)

1. Levanta un Postgres local (o usa `docker compose up db -d`).
2. `cp .env.example .env` y ajusta `DATABASE_URL`.
3. `pnpm install`
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

## Despliegue: Supabase (DB) + Render (API)

### 1. Base de datos en Supabase
1. Crea un proyecto en supabase.com (elige una contraseña de base de datos fuerte, la vas a necesitar).
2. Ve a **Project Settings → Database → Connection string**. Copia dos strings:
   - **Transaction pooler** (puerto `6543`) → esta es tu `DATABASE_URL`. Agrégale `?pgbouncer=true` al final.
   - **Direct connection** (puerto `5432`) → esta es tu `DIRECT_URL`.
3. Guárdalas, las vas a pegar en Render en el siguiente paso.

### 2. API en Render
1. En render.com: **New → Web Service**, conecta el repo `dgusgus/gimnasio-backend`.
2. Environment: **Docker** (Render detecta el `Dockerfile` solo). Plan: **Free**.
3. En **Environment Variables** agrega:
   - `DATABASE_URL` (la pooled de Supabase)
   - `DIRECT_URL` (la directa de Supabase)
   - `JWT_SECRET` (algo largo y aleatorio)
   - `FRONTEND_URL` (tu URL de GitHub Pages)
   - `NODE_ENV=production`
4. Deploy. El `CMD` del Dockerfile corre `prisma migrate deploy` automáticamente antes de levantar el server — no hace falta migrar a mano.
5. Cuando termine, Render te da una URL tipo `https://gimnasio-backend-xxxx.onrender.com`. Prueba `GET /health`.

### 3. Crear el admin inicial
Render Free no da acceso a shell, así que corres el seed **desde tu máquina**, apuntando a Supabase:
```bash
DATABASE_URL="<la pooled de Supabase>" DIRECT_URL="<la directa de Supabase>" pnpm seed
```

### Cosas a saber de este combo (importante)
- **Cold start**: el servicio Free de Render "duerme" tras ~15 min sin tráfico. La primera petición después de eso tarda 30-50s en responder — normal, no es un bug. Conviene mostrar un loading/spinner en el login del frontend por si acaso.
- **Supabase también se pausa** si el proyecto está 1 semana sin actividad (plan free). Se reactiva con un clic desde el dashboard, pero si notas que la API responde error de conexión, revisa eso primero.
- Nunca subas `DATABASE_URL`/`DIRECT_URL` reales a GitHub — van solo en las env vars de Render.

## Notas de arquitectura

- Crear una membresía (`POST /membresias`) NO registra el pago — son dos pasos separados a propósito, para no acoplar "dar de alta" con "cobrar".
- Registrar un pago (`POST /pagos`) sí reactiva la membresía (`estado: ACTIVA`) dentro de una transacción, para que nunca quede un pago sin su efecto reflejado.
- Los clientes se desactivan (soft delete), nunca se borran, para no perder el historial de pagos.
