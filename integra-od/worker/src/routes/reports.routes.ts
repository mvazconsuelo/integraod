import { Hono } from "hono";
import type { Env } from "../types/env";
import { rangeSchema } from "../schemas";
import { budgetsCsv, paymentsCsv } from "../services/reports.service";

export const reports = new Hono<{ Bindings: Env }>();

const csv = (c: { body: (b: string, s: 200, h: Record<string, string>) => Response }, name: string, from: string, to: string, content: string) =>
  c.body(content, 200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}_${from}_a_${to}.csv"`, "Cache-Control": "no-store" });

const range = (c: { req: { query: (k: string) => string | undefined } }) => rangeSchema.parse({ from: c.req.query("from"), to: c.req.query("to") });

reports.get("/cobros", async (c) => { const { from, to } = range(c); return csv(c, "cobros", from, to, await paymentsCsv(c.env.DB, from, to)); });
reports.get("/presupuestos", async (c) => { const { from, to } = range(c); return csv(c, "presupuestos", from, to, await budgetsCsv(c.env.DB, from, to)); });
