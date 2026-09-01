import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { asyncHandler, HttpError } from "../../middlewares/errorHandler.js";
import { requireAuth, requireRol } from "../../middlewares/auth.js";
import type { JwtPayload } from "../../utils/jwt.js";

export const asistenciaRouter = Router();
asistenciaRouter.use(requireAuth);

const estadoAsistenciaEnum = z.enum([
  "PRESENTE",
  "AUSENTE",
  "TARDANZA",
  "JUSTIFICADO",
]);

// La columna es @db.Date: normalizamos a medianoche UTC para que la
// comparación de fechas en el upsert/where sea exacta y no dependa de la
// hora con la que llegó el request.
function aFechaSolo(fecha: Date): Date {
  return new Date(
    Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate())
  );
}

const marcarSchema = z.object({
  inscripcionId: z.string().uuid(),
  fecha: z.coerce.date().transform(aFechaSolo),
  estado: estadoAsistenciaEnum,
});

// Un ADMIN puede marcar cualquier horario; un INSTRUCTOR solo el suyo
async function verificarPermisoHorario(horarioId: string, usuario: JwtPayload) {
  if (usuario.rol === "ADMIN") return;
  if (usuario.rol !== "INSTRUCTOR") {
    throw new HttpError(403, "No autorizado para esta acción");
  }

  const instructor = await prisma.instructor.findUnique({
    where: { usuarioId: usuario.sub },
  });
  if (!instructor) throw new HttpError(403, "No autorizado para esta acción");

  const asignado = await prisma.horarioInstructor.findUnique({
    where: {
      horarioId_instructorId: { horarioId, instructorId: instructor.id },
    },
  });
  if (!asignado) throw new HttpError(403, "No dictas este horario");
}

// GET /asistencia?horarioId=..&fecha=2026-08-31
// Roster de inscritos activos con su asistencia de esa fecha (si ya se marcó)
asistenciaRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const horarioId = String(req.query.horarioId ?? "");
    if (!horarioId) throw new HttpError(400, "horarioId es requerido");

    const fecha = aFechaSolo(
      req.query.fecha ? new Date(String(req.query.fecha)) : new Date()
    );

    await verificarPermisoHorario(horarioId, req.usuario!);

    const inscripciones = await prisma.inscripcion.findMany({
      where: { horarioId, estado: "ACTIVA" },
      include: {
        cliente: true,
        asistencias: { where: { fecha } },
      },
      orderBy: { cliente: { nombre: "asc" } },
    });

    res.json(
      inscripciones.map((i) => ({
        inscripcionId: i.id,
        cliente: i.cliente,
        asistencia: i.asistencias[0] ?? null,
      }))
    );
  })
);

asistenciaRouter.post(
  "/",
  requireRol("ADMIN", "INSTRUCTOR"),
  asyncHandler(async (req, res) => {
    const { inscripcionId, fecha, estado } = marcarSchema.parse(req.body);

    const inscripcion = await prisma.inscripcion.findUnique({
      where: { id: inscripcionId },
    });
    if (!inscripcion) throw new HttpError(404, "Inscripción no encontrada");

    await verificarPermisoHorario(inscripcion.horarioId, req.usuario!);

    const asistencia = await prisma.asistencia.upsert({
      where: { inscripcionId_fecha: { inscripcionId, fecha } },
      update: { estado, marcadoPorId: req.usuario!.sub },
      create: { inscripcionId, fecha, estado, marcadoPorId: req.usuario!.sub },
    });

    res.status(201).json(asistencia);
  })
);