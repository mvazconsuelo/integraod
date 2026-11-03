import { Hono } from "hono";
import type { Env } from "../types/env";
import { listActivity } from "../services/activity.service";

export const activity = new Hono<{ Bindings: Env }>();

activity.get("/", async (c) => c.json(await listActivity(c.env.DB, Math.min(200, Number(c.req.query("limit")) || 60))));
