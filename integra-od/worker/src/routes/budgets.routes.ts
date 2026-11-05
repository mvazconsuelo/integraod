import { Hono } from "hono";
import type { Env } from "../types/env";
import { budgetAnswerSchema, budgetCollectMethodSchema, budgetPaymentModeSchema, budgetSchema, budgetSharedSchema, budgetStatusSchema } from "../schemas";
import { parseBody } from "../middleware/validation";
import * as svc from "../services/budgets.service";
import { cancelOpenRequestsOfBudget, switchBudgetToManual } from "../services/payments.service";

export const budgets = new Hono<{ Bindings: Env }>();

budgets.get("/", async (c) => c.json(await svc.listBudgets(c.env.DB)));
budgets.post("/", async (c) => c.json(await svc.createBudget(c.env.DB, await parseBody(c, budgetSchema)), 201));
budgets.get("/:id", async (c) => c.json(await svc.getBudgetDetail(c.env.DB, c.req.param("id"))));
budgets.put("/:id", async (c) => c.json(await svc.updateBudget(c.env.DB, c.req.param("id"), await parseBody(c, budgetSchema))));
budgets.post("/:id/shared", async (c) => c.json(await svc.recordShared(c.env.DB, c.req.param("id"), (await parseBody(c, budgetSharedSchema)).channel)));
budgets.post("/:id/answer", async (c) => c.json(await svc.recordAnswer(c.env.DB, c.req.param("id"), (await parseBody(c, budgetAnswerSchema)).answer)));
budgets.post("/:id/collect-method", async (c) => c.json(await svc.setCollectMethod(c.env.DB, c.req.param("id"), (await parseBody(c, budgetCollectMethodSchema)).method)));
budgets.post("/:id/payment-mode", async (c) => c.json(await svc.setPaymentMode(c.env.DB, c.req.param("id"), (await parseBody(c, budgetPaymentModeSchema)).mode)));
budgets.post("/:id/collect-manual", async (c) => { await switchBudgetToManual(c.env, c.req.param("id")); return c.json(await svc.getBudgetDetail(c.env.DB, c.req.param("id"))); });
budgets.post("/:id/status", async (c) => {
  const { status } = await parseBody(c, budgetStatusSchema);
  return c.json(await svc.changeStatus(c.env.DB, c.req.param("id"), status, { cancelLinks: (id) => cancelOpenRequestsOfBudget(c.env, id) }));
});
