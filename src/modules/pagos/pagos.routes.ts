import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { asyncHandler, HttpError } from "../../middlewares/errorHandler.js";
import { requireAuth, requireRol } from "../../middlewares/auth.js";

export const pagosRouter = Router();
pagosRouter.use(requireAuth);

const crearPagoSchema = z.object({
  membresiaId: z.string().uuid(),
  monto: z.number().positive(),
  metodo: z.enum(["EFECTIVO", "TARJETA", "TRANSFERENCIA", "QR"]),
});

pagosRouter.post(
  "/",
  requireRol("ADMIN", "RECEPCION"),
  asyncHandler(async (req, res) => {
    const { membresiaId, monto, metodo } = crearPagoSchema.parse(req.body);

    const membresia = await prisma.membresia.findUnique({
      where: { id: membresiaId },
    });
    if (!membresia) throw new HttpError(404, "Membresía no encontrada");

    // Transacción: si algo falla, no queda un pago huérfano ni una
    // membresía reactivada sin su pago correspondiente.
    const [pago] = await prisma.$transaction([
      prisma.pago.create({
        data: {
          membresiaId,
          monto,
          metodo,
          registradoPorId: req.usuario!.sub,
        },
      }),
      prisma.membresia.update({
        where: { id: membresiaId },
        data: { estado: "ACTIVA" },
      }),
    ]);

    res.status(201).json(pago);
  })
);

pagosRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { desde, hasta } = req.query;

    const pagos = await prisma.pago.findMany({
      where: {
        ...(desde || hasta
          ? {
              fecha: {
                ...(desde ? { gte: new Date(String(desde)) } : {}),
                ...(hasta ? { lte: new Date(String(hasta)) } : {}),
              },
            }
          : {}),
      },
      include: {
        membresia: { include: { cliente: true } },
        registradoPor: { select: { nombre: true, email: true } },
      },
      orderBy: { fecha: "desc" },
    });

    res.json(pagos);
  })
);
