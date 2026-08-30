import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { asyncHandler, HttpError } from "../../middlewares/errorHandler.js";
import { requireAuth, requireRol } from "../../middlewares/auth.js";

export const clientesRouter = Router();
clientesRouter.use(requireAuth);

const clienteSchema = z.object({
  nombre: z.string().min(2),
  telefono: z.string().optional(),
  email: z.string().email().optional(),
});

// GET /clientes?activo=true&q=juan
clientesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { activo, q } = req.query;

    const clientes = await prisma.cliente.findMany({
      where: {
        ...(activo !== undefined ? { activo: activo === "true" } : {}),
        ...(q
          ? { nombre: { contains: String(q), mode: "insensitive" } }
          : {}),
      },
      orderBy: { nombre: "asc" },
      include: {
        membresias: {
          orderBy: { fechaVencimiento: "desc" },
          take: 1,
        },
      },
    });

    res.json(clientes);
  })
);

clientesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const cliente = await prisma.cliente.findUnique({
      where: { id: req.params.id },
      include: { membresias: { include: { pagos: true } } },
    });
    if (!cliente) throw new HttpError(404, "Cliente no encontrado");
    res.json(cliente);
  })
);

clientesRouter.post(
  "/",
  requireRol("ADMIN", "RECEPCION"),
  asyncHandler(async (req, res) => {
    const data = clienteSchema.parse(req.body);
    const cliente = await prisma.cliente.create({ data });
    res.status(201).json(cliente);
  })
);

clientesRouter.patch(
  "/:id",
  requireRol("ADMIN", "RECEPCION"),
  asyncHandler(async (req, res) => {
    const data = clienteSchema.partial().parse(req.body);
    const cliente = await prisma.cliente.update({
      where: { id: req.params.id },
      data,
    });
    res.json(cliente);
  })
);

clientesRouter.delete(
  "/:id",
  requireRol("ADMIN"),
  asyncHandler(async (req, res) => {
    // Soft delete: nunca borramos históricos de pagos
    const cliente = await prisma.cliente.update({
      where: { id: req.params.id },
      data: { activo: false },
    });
    res.json(cliente);
  })
);
