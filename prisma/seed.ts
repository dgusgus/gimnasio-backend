import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@gimnasio.com";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "admin1234";

  const existente = await prisma.usuario.findUnique({ where: { email } });
  if (existente) {
    console.log(`El admin ${email} ya existe, no se crea de nuevo.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.usuario.create({
    data: {
      nombre: "Administrador",
      email,
      passwordHash,
      rol: "ADMIN",
    },
  });

  console.log(`Admin creado -> email: ${email} / password: ${password}`);
  console.log("Cambia esta contraseña apenas inicies sesión.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
