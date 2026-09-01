import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { asyncHandler, HttpError } from "../../middlewares/errorHandler.js";
import { requireAuth, requireRol } from "../../middlewares/auth.js";

export const inscripcionesRouter = Router();
inscripcionesRouter.use(requireAuth);

const estadoInscripcionEnum = z.enum(["ACTIVA", "CANCELADA"]);

const inscribirSchema = z.object({
  clienteId: z.string().uuid(),
  horarioId: z.string().uuid(),
});

// Inscribe a un alumno en un horario. Si ya existía una inscripción cancelada
// para ese mismo cliente+horario, la reactiva en vez de duplicar (choca con
// el @@unique([clienteId, horarioId]) del schema).
inscripcionesRouter.post(
  "/",
  requireRol("ADMIN", "RECEPCION"),
  asyncHandler(async (req, res) => {
    const { clienteId, horarioId } = inscribirSchema.parse(req.body);

    const [cliente, horario] = await Promise.all([
      prisma.cliente.findUnique({ where: { id: clienteId } }),
      prisma.horario.findUnique({ where: { id: horarioId } }),
    ]);
    if (!cliente) throw new HttpError(404, "Cliente no encontrado");
    if (!horario) throw new HttpError(404, "Horario no encontrado");

    const existente = await prisma.inscripcion.findUnique({
      where: { clienteId_horarioId: { clienteId, horarioId } },
    });

    if (existente && existente.estado === "ACTIVA") {
      throw new HttpError(409, "El alumno ya está inscrito en este horario");
    }

    const inscripcion = existente
      ? await prisma.inscripcion.update({
          where: { id: existente.id },
          data: { estado: "ACTIVA", fechaInscripcion: new Date() },
        })
      : await prisma.inscripcion.create({
          data: { clienteId, horarioId },
        });

    res.status(existente ? 200 : 201).json(inscripcion);
  })
);

inscripcionesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { clienteId, horarioId, estado } = req.query;

    const inscripciones = await prisma.inscripcion.findMany({
      where: {
        ...(clienteId ? { clienteId: String(clienteId) } : {}),
        ...(horarioId ? { horarioId: String(horarioId) } : {}),
        ...(estado ? { estado: estadoInscripcionEnum.parse(estado) } : {}),
      },
      include: { cliente: true, horario: true },
      orderBy: { fechaInscripcion: "desc" },
    });

    res.json(inscripciones);
  })
);

inscripcionesRouter.patch(
  "/:id/cancelar",
  requireRol("ADMIN", "RECEPCION"),
  asyncHandler(async (req, res) => {
    const inscripcion = await prisma.inscripcion.update({
      where: { id: req.params.id },
      data: { estado: "CANCELADA" },
    });
    res.json(inscripcion);
  })
);