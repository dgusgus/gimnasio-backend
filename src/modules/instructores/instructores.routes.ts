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
  sueldoBase: z.number().positive().optional(),
});

const actualizarInstructorSchema = z.object({
  nombre: z.string().min(2).optional(),
  email: z.string().email().optional(),
  especialidad: z.string().nullable().optional(),
  telefono: z.string().nullable().optional(),
  sueldoBase: z.number().positive().nullable().optional(),
  password: z.string().min(6).optional(),
});

// Crea el Usuario (rol INSTRUCTOR) y su perfil de Instructor en una sola operación
instructoresRouter.post(
  "/",
  requireRol("ADMIN"),
  asyncHandler(async (req, res) => {
    const { nombre, email, password, especialidad, telefono, sueldoBase } =
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
          create: { especialidad, telefono, sueldoBase },
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

instructoresRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const instructor = await prisma.instructor.findUnique({
      where: { id: req.params.id },
      include: {
        usuario: {
          select: { nombre: true, email: true, activo: true },
        },
        bonos: { orderBy: { fecha: "desc" }, take: 10 },
        descuentos: { orderBy: { fecha: "desc" }, take: 10 },
      },
    });
    if (!instructor) throw new HttpError(404, "Instructor no encontrado");
    res.json(instructor);
  })
);

const bonoSchema = z.object({
  monto: z.number().positive(),
  motivo: z.string().min(2),
});

instructoresRouter.get(
  "/:id/bonos",
  asyncHandler(async (req, res) => {
    const instructor = await prisma.instructor.findUnique({
      where: { id: req.params.id },
    });
    if (!instructor) throw new HttpError(404, "Instructor no encontrado");

    const bonos = await prisma.bono.findMany({
      where: { instructorId: req.params.id },
      orderBy: { fecha: "desc" },
    });

    res.json(bonos);
  })
);

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

const descuentoSchema = z.object({
  monto: z.number().positive(),
  motivo: z.string().min(2),
});

instructoresRouter.get(
  "/:id/descuentos",
  asyncHandler(async (req, res) => {
    const instructor = await prisma.instructor.findUnique({
      where: { id: req.params.id },
    });
    if (!instructor) throw new HttpError(404, "Instructor no encontrado");

    const descuentos = await prisma.descuento.findMany({
      where: { instructorId: req.params.id },
      orderBy: { fecha: "desc" },
    });

    res.json(descuentos);
  })
);

instructoresRouter.post(
  "/:id/descuentos",
  requireRol("ADMIN"),
  asyncHandler(async (req, res) => {
    const { monto, motivo } = descuentoSchema.parse(req.body);

    const instructor = await prisma.instructor.findUnique({
      where: { id: req.params.id },
    });
    if (!instructor) throw new HttpError(404, "Instructor no encontrado");

    const descuento = await prisma.descuento.create({
      data: { instructorId: req.params.id, monto, motivo },
    });

    res.status(201).json(descuento);
  })
);

// Actualiza los datos del Usuario y del perfil de Instructor.
// Nombre/email/password viven en Usuario; el resto en el perfil de Instructor.
instructoresRouter.patch(
  "/:id",
  requireRol("ADMIN"),
  asyncHandler(async (req, res) => {
    const data = actualizarInstructorSchema.parse(req.body);

    const instructor = await prisma.instructor.findUnique({
      where: { id: req.params.id },
      include: { usuario: true },
    });
    if (!instructor) throw new HttpError(404, "Instructor no encontrado");

    const { nombre, email, password, ...perfil } = data;

    if (email && email !== instructor.usuario.email) {
      const emailExistente = await prisma.usuario.findFirst({
        where: { email, id: { not: instructor.usuario.id } },
      });
      if (emailExistente) throw new HttpError(409, "Ese email ya está registrado");
    }

    const actualizado = await prisma.$transaction(async (tx) => {
      const usuarioActualizado = await tx.usuario.update({
        where: { id: instructor.usuario.id },
        data: {
          ...(nombre !== undefined ? { nombre } : {}),
          ...(email !== undefined ? { email } : {}),
          ...(password !== undefined
            ? { passwordHash: await bcrypt.hash(password, 10) }
            : {}),
        },
      });

      const instructorActualizado = await tx.instructor.update({
        where: { id: instructor.id },
        data: {
          ...(perfil.especialidad !== undefined
            ? { especialidad: perfil.especialidad }
            : {}),
          ...(perfil.telefono !== undefined ? { telefono: perfil.telefono } : {}),
          ...(perfil.sueldoBase !== undefined
            ? { sueldoBase: perfil.sueldoBase }
            : {}),
        },
      });

      return { usuario: usuarioActualizado, instructor: instructorActualizado };
    });

    res.json(actualizado);
  })
);

instructoresRouter.delete(
  "/:id",
  requireRol("ADMIN"),
  asyncHandler(async (req, res) => {
    // Soft delete: marcamos inactivos al Usuario y al perfil de Instructor,
    // conservando su historial de bonos, descuentos y pagos de sueldo.
    const instructor = await prisma.instructor.findUnique({
      where: { id: req.params.id },
    });
    if (!instructor) throw new HttpError(404, "Instructor no encontrado");

    const eliminado = await prisma.$transaction([
      prisma.instructor.update({
        where: { id: instructor.id },
        data: { activo: false },
      }),
      prisma.usuario.update({
        where: { id: instructor.usuarioId },
        data: { activo: false },
      }),
    ]);

    res.json(eliminado[0]);
  })
);