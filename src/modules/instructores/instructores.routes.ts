import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { asyncHandler, HttpError } from "../../middlewares/errorHandler.js";
import { requireAuth, requireRol } from "../../middlewares/auth.js";

export const instructoresRouter = Router();
instructoresRouter.use(requireAuth);

const crearInstructorSchema = z.object({
  nombre: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  especialidad: z.string().optional(),
  telefono: z.string().optional(),
});

// Crea el Usuario (rol INSTRUCTOR) y su perfil de Instructor en una sola operación
instructoresRouter.post(
  "/",
  requireRol("ADMIN"),
  asyncHandler(async (req, res) => {
    const { nombre, email, password, especialidad, telefono } =
      crearInstructorSchema.parse(req.body);

    const existente = await prisma.usuario.findUnique({ where: { email } });
    if (existente) throw new HttpError(409, "Ese email ya está registrado");

    const passwordHash = await bcrypt.hash(password, 10);

    const instructor = await prisma.usuario.create({
      data: {
        nombre,
        email,
        passwordHash,
        rol: "INSTRUCTOR",
        instructor: {
          create: { especialidad, telefono },
        },
      },
      include: { instructor: true },
    });

    res.status(201).json(instructor);
  })
);

instructoresRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const instructores = await prisma.instructor.findMany({
      where: { activo: true },
      include: { usuario: { select: { nombre: true, email: true } } },
    });
    res.json(instructores);
  })
);

const bonoSchema = z.object({
  monto: z.number().positive(),
  motivo: z.string().min(2),
});

instructoresRouter.post(
  "/:id/bonos",
  requireRol("ADMIN"),
  asyncHandler(async (req, res) => {
    const { monto, motivo } = bonoSchema.parse(req.body);

    const instructor = await prisma.instructor.findUnique({
      where: { id: req.params.id },
    });
    if (!instructor) throw new HttpError(404, "Instructor no encontrado");

    const bono = await prisma.bono.create({
      data: { instructorId: req.params.id, monto, motivo },
    });

    res.status(201).json(bono);
  })
);
