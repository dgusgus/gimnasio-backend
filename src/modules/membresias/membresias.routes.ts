import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { asyncHandler, HttpError } from "../../middlewares/errorHandler.js";
import { requireAuth, requireRol } from "../../middlewares/auth.js";

export const membresiasRouter = Router();
membresiasRouter.use(requireAuth);

// GET /membresias?clienteId=... -> membresías de un cliente con su saldo
// pendiente ya calculado (precioPagado - suma de sus pagos). Sin esto, el
// frontend no tiene forma de saber cuánto falta cobrar de cada una.
membresiasRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { clienteId } = req.query;

    const membresias = await prisma.membresia.findMany({
      where: clienteId ? { clienteId: String(clienteId) } : {},
      include: { plan: true, pagos: true },
      orderBy: { createdAt: "desc" },
    });

    const conSaldo = membresias.map((m) => {
      const totalPagado = m.pagos.reduce((acc, p) => acc + Number(p.monto), 0);
      const saldo = Math.max(Number(m.precioPagado) - totalPagado, 0);
      return { ...m, totalPagado, saldo };
    });

    res.json(conSaldo);
  })
);

const crearMembresiaSchema = z.object({
  clienteId: z.string().uuid(),
  planId: z.string().uuid(),
  fechaInicio: z.coerce.date().optional(),
});

// Crea la membresía a partir de un Plan. No registra el pago aquí: eso es
// responsabilidad del módulo de pagos, para no acoplar "crear membresía"
// con "cobrar".
membresiasRouter.post(
  "/",
  requireRol("ADMIN", "RECEPCION"),
  asyncHandler(async (req, res) => {
    const { clienteId, planId, fechaInicio } = crearMembresiaSchema.parse(req.body);

    const [cliente, plan] = await Promise.all([
      prisma.cliente.findUnique({ where: { id: clienteId } }),
      prisma.plan.findUnique({ where: { id: planId } }),
    ]);
    if (!cliente) throw new HttpError(404, "Cliente no encontrado");
    if (!plan || !plan.activo) throw new HttpError(404, "Plan no encontrado o inactivo");

    const inicio = fechaInicio ?? new Date();
    const vencimiento = new Date(inicio);
    vencimiento.setDate(vencimiento.getDate() + plan.duracionDias);

    const membresia = await prisma.membresia.create({
      data: {
        clienteId,
        planId,
        precioPagado: plan.precio, // foto del precio del plan al momento de comprar
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
      include: { cliente: true, plan: true },
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

const pausarSchema = z.object({ motivo: z.string().optional() });

membresiasRouter.patch(
  "/:id/pausar",
  requireRol("ADMIN", "RECEPCION"),
  asyncHandler(async (req, res) => {
    const { motivo } = pausarSchema.parse(req.body ?? {});

    const membresia = await prisma.membresia.findUnique({ where: { id: req.params.id } });
    if (!membresia) throw new HttpError(404, "Membresía no encontrada");
    if (membresia.estado !== "ACTIVA") {
      throw new HttpError(400, "Solo se puede pausar una membresía activa");
    }

    const [, pausa] = await prisma.$transaction([
      prisma.membresia.update({
        where: { id: membresia.id },
        data: { estado: "CONGELADA" },
      }),
      prisma.pausaMembresia.create({
        data: { membresiaId: membresia.id, motivo },
      }),
    ]);

    res.json(pausa);
  })
);

// Reanuda la membresía y corre la fechaVencimiento los días que duró la pausa
membresiasRouter.patch(
  "/:id/reanudar",
  requireRol("ADMIN", "RECEPCION"),
  asyncHandler(async (req, res) => {
    const membresia = await prisma.membresia.findUnique({ where: { id: req.params.id } });
    if (!membresia) throw new HttpError(404, "Membresía no encontrada");
    if (membresia.estado !== "CONGELADA") {
      throw new HttpError(400, "La membresía no está pausada");
    }

    const pausaActiva = await prisma.pausaMembresia.findFirst({
      where: { membresiaId: membresia.id, fechaFin: null },
      orderBy: { fechaInicio: "desc" },
    });
    if (!pausaActiva) throw new HttpError(400, "No hay una pausa activa registrada");

    const ahora = new Date();
    const diasPausados = Math.ceil(
      (ahora.getTime() - pausaActiva.fechaInicio.getTime()) / (1000 * 60 * 60 * 24)
    );
    const nuevoVencimiento = new Date(membresia.fechaVencimiento);
    nuevoVencimiento.setDate(nuevoVencimiento.getDate() + diasPausados);

    const [membresiaActualizada] = await prisma.$transaction([
      prisma.membresia.update({
        where: { id: membresia.id },
        data: { estado: "ACTIVA", fechaVencimiento: nuevoVencimiento },
      }),
      prisma.pausaMembresia.update({
        where: { id: pausaActiva.id },
        data: { fechaFin: ahora },
      }),
    ]);

    res.json(membresiaActualizada);
  })
);