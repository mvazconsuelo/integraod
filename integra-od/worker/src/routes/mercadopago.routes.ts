import { Hono } from "hono";
import type { Env } from "../types/env";
import { connectProvider, disconnectProvider } from "../services/payments.service";

/** Conectar o desconectar la cuenta de Mercado Pago. La conexión la completa el servicio de pagos: esta app nunca ve las credenciales. */
export const mercadopago = new Hono<{ Bindings: Env }>();

mercadopago.get("/connect", async (c) => c.json(await connectProvider(c.env, "mercadopago")));
mercadopago.post("/disconnect", async (c) => c.json(await disconnectProvider(c.env, "mercadopago")));
