import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { asyncHandler, HttpError } from "../../middlewares/errorHandler.js";
import { requireAuth, requireRol } from "../../middlewares/auth.js";

export const sueldosRouter = Router();
sueldosRouter.use(requireAuth, requireRol("ADMIN"));

const generarSchema = z.object({
  instructorId: z.string().uuid(),
  periodo: z.string().regex(/^\d{4}-\d{2}$/, "Formato YYYY-MM"),
});

function rangoDelPeriodo(periodo: string) {
  const [anio, mes] = periodo.split("-").map(Number);
  const desde = new Date(Date.UTC(anio, mes - 1, 1));
  const hasta = new Date(Date.UTC(anio, mes, 1)); // primer día del mes siguiente
  return { desde, hasta };
}

// Calcula (o recalcula) la planilla de un instructor para un periodo,
// sumando los bonos y descuentos registrados dentro de ese mes.
sueldosRouter.post(
  "/generar",
  asyncHandler(async (req, res) => {
    const { instructorId, periodo } = generarSchema.parse(req.body);

    const instructor = await prisma.instructor.findUnique({
      where: { id: instructorId },
    });
    if (!instructor) throw new HttpError(404, "Instructor no encontrado");
    if (instructor.sueldoBase == null) {
      throw new HttpError(400, "El instructor no tiene sueldo base configurado");
    }

    const { desde, hasta } = rangoDelPeriodo(periodo);

    const [bonos, descuentos] = await Promise.all([
      prisma.bono.findMany({
        where: { instructorId, fecha: { gte: desde, lt: hasta } },
      }),
      prisma.descuento.findMany({
        where: { instructorId, fecha: { gte: desde, lt: hasta } },
      }),
    ]);

    const totalBonos = bonos.reduce((acc, b) => acc + Number(b.monto), 0);
    const totalDescuentos = descuentos.reduce((acc, d) => acc + Number(d.monto), 0);
    const montoBase = Number(instructor.sueldoBase);
    const montoTotal = montoBase + totalBonos - totalDescuentos;

    const pago = await prisma.pagoSueldo.upsert({
      where: { instructorId_periodo: { instructorId, periodo } },
      update: { montoBase, totalBonos, totalDescuentos, montoTotal },
      create: { instructorId, periodo, montoBase, totalBonos, totalDescuentos, montoTotal },
    });

    res.status(201).json(pago);
  })
);

sueldosRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { instructorId, periodo } = req.query;

    const pagos = await prisma.pagoSueldo.findMany({
      where: {
        ...(instructorId ? { instructorId: String(instructorId) } : {}),
        ...(periodo ? { periodo: String(periodo) } : {}),
      },
      include: { instructor: { include: { usuario: { select: { nombre: true } } } } },
      orderBy: { periodo: "desc" },
    });

    res.json(pagos);
  })
);

sueldosRouter.patch(
  "/:id/pagar",
  asyncHandler(async (req, res) => {
    const pago = await prisma.pagoSueldo.update({
      where: { id: req.params.id },
      data: { estado: "PAGADO", fechaPago: new Date() },
    });
    res.json(pago);
  })
);