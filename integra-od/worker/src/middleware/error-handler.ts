import type { ErrorHandler } from "hono";
import { ZodError } from "zod";
import { AppError } from "../utils/errors";

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof AppError) return c.json({ error: err.message, code: err.code, ...(err.details !== undefined ? { details: err.details } : {}) }, err.status);
  if (err instanceof ZodError) {
    return c.json({ error: err.issues[0]?.message ?? "Revisá los datos ingresados.", code: "validation" }, 400);
  }
  // Sin datos sensibles en logs: solo el nombre y el mensaje del error.
  console.error("unhandled", err instanceof Error ? `${err.name}: ${err.message}` : "unknown");
  return c.json({ error: "Algo salió mal de nuestro lado. Intentá de nuevo en unos minutos.", code: "internal" }, 500);
};
