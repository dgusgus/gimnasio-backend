import express from "express";
import cors from "cors";
import { authRouter } from "./modules/auth/auth.routes.js";
import { clientesRouter } from "./modules/clientes/clientes.routes.js";
import { planesRouter } from "./modules/planes/planes.routes.js";
import { membresiasRouter } from "./modules/membresias/membresias.routes.js";
import { pagosRouter } from "./modules/pagos/pagos.routes.js";
import { instructoresRouter } from "./modules/instructores/instructores.routes.js";
import { horariosRouter } from "./modules/horarios/horarios.routes.js";
import { inscripcionesRouter } from "./modules/inscripciones/inscripciones.routes.js";
import { asistenciaRouter } from "./modules/asistencia/asistencia.routes.js";
import { visitasRouter } from "./modules/visitas/visitas.routes.js";
import { sueldosRouter } from "./modules/sueldos/sueldos.routes.js";
import { errorHandler } from "./middlewares/errorHandler.js";

export const app = express();

const origenesPermitidos = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(",").map((o) => o.trim())
  : true; // en desarrollo, permite cualquier origen

app.use(cors({ origin: origenesPermitidos }));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use("/auth", authRouter);
app.use("/clientes", clientesRouter);
app.use("/planes", planesRouter);
app.use("/membresias", membresiasRouter);
app.use("/pagos", pagosRouter);
app.use("/instructores", instructoresRouter);
app.use("/horarios", horariosRouter);
app.use("/inscripciones", inscripcionesRouter);
app.use("/asistencia", asistenciaRouter);
app.use("/visitas", visitasRouter);
app.use("/sueldos", sueldosRouter);

// Siempre al final: captura errores lanzados por asyncHandler y zod
app.use(errorHandler);