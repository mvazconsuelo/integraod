import { app } from "./app";
import { deliverAllOutboxes } from "./infrastructure/scheduler";
import type { Env } from "./shared/env";

export default {
  fetch: app.fetch,
  // Reintento periódico de los avisos que no llegaron a la app.
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(deliverAllOutboxes(env));
  },
};
