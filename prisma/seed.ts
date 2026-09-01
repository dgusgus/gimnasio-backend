import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma.js";

async function main() {
  const passwordHash = await bcrypt.hash("admin123", 10);

  const admin = await prisma.usuario.upsert({
    where: { email: "admin@gimnasio.com" },
    update: {},
    create: {
      email: "admin@gimnasio.com",
      passwordHash,
      nombre: "Admin",
      rol: "ADMIN",
    },
  });

  console.log(`Usuario admin listo: ${admin.email} / admin123`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });