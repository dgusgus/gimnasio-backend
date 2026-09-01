import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { asyncHandler, HttpError } from "../../middlewares/errorHandler.js";
import { requireAuth, requireRol } from "../../middlewares/auth.js";

export const horariosRouter = Router();
horariosRouter.use(requireAuth);

const diaSemanaEnum = z.enum([
  "LUNES",
  "MARTES",
  "MIERCOLES",
  "JUEVES",
  "VIERNES",
  "SABADO",
  "DOMINGO",
]);

const horarioSchema = z.object({
  nombre: z.string().optional(),
  diaSemana: diaSemanaEnum,
  horaInicio: z.string().regex(/^\d{2}:\d{2}$/, "Formato HH:MM"),
  horaFin: z.string().regex(/^\d{2}:\d{2}$/, "Formato HH:MM"),
  cupoMaximo: z.number().int().positive().optional(),
  instructorIds: z.array(z.string().uuid()).min(1),
});

// GET /horarios?diaSemana=LUNES&instructorId=...
horariosRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { diaSemana, instructorId } = req.query;

    const horarios = await prisma.horario.findMany({
      where: {
        activo: true,
        ...(diaSemana ? { diaSemana: diaSemanaEnum.parse(diaSemana) } : {}),
        ...(instructorId
          ? { instructores: { some: { instructorId: String(instructorId) } } }
          : {}),
      },
      include: {
        instructores: {
          include: {
            instructor: {
              include: { usuario: { select: { nombre: true } } },
            },
          },
        },
        _count: { select: { inscripciones: true } },
      },
      orderBy: [{ diaSemana: "asc" }, { horaInicio: "asc" }],
    });

    res.json(horarios);
  })
);

horariosRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const horario = await prisma.horario.findUnique({
      where: { id: req.params.id },
      include: {
        instructores: { include: { instructor: true } },
        inscripciones: {
          where: { estado: "ACTIVA" },
          include: { cliente: true },
        },
      },
    });
    if (!horario) throw new HttpError(404, "Horario no encontrado");
    res.json(horario);
  })
);

horariosRouter.post(
  "/",
  requireRol("ADMIN"),
  asyncHandler(async (req, res) => {
    const { instructorIds, ...data } = horarioSchema.parse(req.body);

    const horario = await prisma.horario.create({
      data: {
        ...data,
        instructores: {
          create: instructorIds.map((instructorId) => ({ instructorId })),
        },
      },
      include: { instructores: true },
    });

    res.status(201).json(horario);
  })
);

// Si mandas instructorIds, reemplaza la lista completa de instructores del horario
horariosRouter.patch(
  "/:id",
  requireRol("ADMIN"),
  asyncHandler(async (req, res) => {
    const { instructorIds, ...data } = horarioSchema.partial().parse(req.body);

    const horario = await prisma.horario.update({
      where: { id: req.params.id },
      data: {
        ...data,
        ...(instructorIds
          ? {
              instructores: {
                deleteMany: {},
                create: instructorIds.map((instructorId) => ({ instructorId })),
              },
            }
          : {}),
      },
      include: { instructores: true },
    });

    res.json(horario);
  })
);

horariosRouter.delete(
  "/:id",
  requireRol("ADMIN"),
  asyncHandler(async (req, res) => {
    const horario = await prisma.horario.update({
      where: { id: req.params.id },
      data: { activo: false },
    });
    res.json(horario);
  })
);