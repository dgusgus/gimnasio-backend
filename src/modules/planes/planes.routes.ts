import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { asyncHandler } from "../../middlewares/errorHandler.js";
import { requireAuth, requireRol } from "../../middlewares/auth.js";

export const planesRouter = Router();
planesRouter.use(requireAuth);

const planSchema = z.object({
  nombre: z.string().min(2),
  duracionDias: z.number().int().positive(),
  precio: z.number().positive(),
  esPromocion: z.boolean().optional(),
  fechaInicioPromo: z.coerce.date().optional(),
  fechaFinPromo: z.coerce.date().optional(),
});

// GET /planes?activo=true -> lo que ve recepción para vender
planesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { activo } = req.query;
    const planes = await prisma.plan.findMany({
      where: activo !== undefined ? { activo: activo === "true" } : {},
      orderBy: { duracionDias: "asc" },
    });
    res.json(planes);
  })
);

planesRouter.post(
  "/",
  requireRol("ADMIN"),
  asyncHandler(async (req, res) => {
    const data = planSchema.parse(req.body);
    const plan = await prisma.plan.create({ data });
    res.status(201).json(plan);
  })
);

planesRouter.patch(
  "/:id",
  requireRol("ADMIN"),
  asyncHandler(async (req, res) => {
    const data = planSchema.partial().parse(req.body);
    const plan = await prisma.plan.update({
      where: { id: req.params.id },
      data,
    });
    res.json(plan);
  })
);

// Desactivar en vez de borrar: no rompe las membresías históricas que lo referencian
planesRouter.delete(
  "/:id",
  requireRol("ADMIN"),
  asyncHandler(async (req, res) => {
    const plan = await prisma.plan.update({
      where: { id: req.params.id },
      data: { activo: false },
    });
    res.json(plan);
  })
);