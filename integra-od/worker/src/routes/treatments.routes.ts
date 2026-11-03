import { Hono } from "hono";
import type { Env } from "../types/env";
import { categoryDeleteSchema, categoryRenameSchema, treatmentSchema } from "../schemas";
import { parseBody } from "../middleware/validation";
import * as svc from "../services/treatments.service";

export const treatments = new Hono<{ Bindings: Env }>();

treatments.get("/recent", async (c) => c.json(await svc.listRecentWork(c.env.DB)));
treatments.get("/", async (c) => c.json(await svc.listTreatments(c.env.DB)));
treatments.post("/", async (c) => c.json(await svc.createTreatment(c.env.DB, await parseBody(c, treatmentSchema)), 201));
treatments.post("/categories/rename", async (c) => {
  const { from, to } = await parseBody(c, categoryRenameSchema);
  await svc.renameCategory(c.env.DB, from, to);
  return c.json({ ok: true });
});
treatments.post("/categories/delete", async (c) => {
  await svc.deleteCategory(c.env.DB, (await parseBody(c, categoryDeleteSchema)).name);
  return c.json({ ok: true });
});
treatments.put("/:id", async (c) => c.json(await svc.updateTreatment(c.env.DB, c.req.param("id"), await parseBody(c, treatmentSchema))));
treatments.delete("/:id", async (c) => {
  await svc.deleteTreatment(c.env.DB, c.req.param("id"));
  return c.body(null, 204);
});
