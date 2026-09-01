import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { asyncHandler, HttpError } from "../../middlewares/errorHandler.js";
import { requireAuth, requireRol } from "../../middlewares/auth.js";

export const visitasRouter = Router();
visitasRouter.use(requireAuth);

const checkInSchema = z.object({
  clienteId: z.string().uuid(),
});

// Check-in rápido: busca si el cliente tiene una membresía vigente y registra
// el ingreso. No exige inscripción a ningún horario (uso libre / pase diario).
visitasRouter.post(
  "/",
  requireRol("ADMIN", "RECEPCION"),
  asyncHandler(async (req, res) => {
    const { clienteId } = checkInSchema.parse(req.body);

    const cliente = await prisma.cliente.findUnique({ where: { id: clienteId } });
    if (!cliente) throw new HttpError(404, "Cliente no encontrado");

    const membresiaVigente = await prisma.membresia.findFirst({
      where: {
        clienteId,
        estado: "ACTIVA",
        fechaVencimiento: { gte: new Date() },
      },
      orderBy: { fechaVencimiento: "desc" },
    });

    const visita = await prisma.visita.create({
      data: {
        clienteId,
        membresiaId: membresiaVigente?.id,
        registradoPorId: req.usuario!.sub,
      },
    });

    res.status(201).json({
      visita,
      // null = no tiene membresía/pase vigente -> cobrar pase diario en recepción
      membresiaVigente: membresiaVigente ?? null,
    });
  })
);

visitasRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { clienteId, desde, hasta } = req.query;

    const visitas = await prisma.visita.findMany({
      where: {
        ...(clienteId ? { clienteId: String(clienteId) } : {}),
        ...(desde || hasta
          ? {
              fechaHora: {
                ...(desde ? { gte: new Date(String(desde)) } : {}),
                ...(hasta ? { lte: new Date(String(hasta)) } : {}),
              },
            }
          : {}),
      },
      include: { cliente: true },
      orderBy: { fechaHora: "desc" },
    });

    res.json(visitas);
  })
);