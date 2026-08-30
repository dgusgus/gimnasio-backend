import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { asyncHandler, HttpError } from "../../middlewares/errorHandler.js";
import { requireAuth, requireRol } from "../../middlewares/auth.js";

export const membresiasRouter = Router();
membresiasRouter.use(requireAuth);

const DIAS_POR_TIPO: Record<string, number> = {
  MENSUAL: 30,
  TRIMESTRAL: 90,
  SEMESTRAL: 180,
  ANUAL: 365,
};

const crearMembresiaSchema = z.object({
  clienteId: z.string().uuid(),
  tipo: z.enum(["MENSUAL", "TRIMESTRAL", "SEMESTRAL", "ANUAL"]),
  fechaInicio: z.coerce.date().optional(),
});

// Crea la membresía. No registra el pago aquí: eso es responsabilidad
// del módulo de pagos, para no acoplar "crear membresía" con "cobrar".
membresiasRouter.post(
  "/",
  requireRol("ADMIN", "RECEPCION"),
  asyncHandler(async (req, res) => {
    const { clienteId, tipo, fechaInicio } = crearMembresiaSchema.parse(
      req.body
    );

    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
    });
    if (!cliente) throw new HttpError(404, "Cliente no encontrado");

    const inicio = fechaInicio ?? new Date();
    const vencimiento = new Date(inicio);
    vencimiento.setDate(vencimiento.getDate() + DIAS_POR_TIPO[tipo]);

    const membresia = await prisma.membresia.create({
      data: {
        clienteId,
        tipo,
        fechaInicio: inicio,
        fechaVencimiento: vencimiento,
        estado: "ACTIVA",
      },
    });

    res.status(201).json(membresia);
  })
);

// Vencimientos próximos (para alertas en el dashboard)
membresiasRouter.get(
  "/vencimientos",
  asyncHandler(async (req, res) => {
    const dias = Number(req.query.dias ?? 7);
    const limite = new Date();
    limite.setDate(limite.getDate() + dias);

    const membresias = await prisma.membresia.findMany({
      where: {
        estado: "ACTIVA",
        fechaVencimiento: { lte: limite },
      },
      include: { cliente: true },
      orderBy: { fechaVencimiento: "asc" },
    });

    res.json(membresias);
  })
);

membresiasRouter.patch(
  "/:id/cancelar",
  requireRol("ADMIN", "RECEPCION"),
  asyncHandler(async (req, res) => {
    const membresia = await prisma.membresia.update({
      where: { id: req.params.id },
      data: { estado: "CANCELADA" },
    });
    res.json(membresia);
  })
);
