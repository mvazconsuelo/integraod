import { AppError } from "../shared/errors";
import type { IntentRow } from "../domain/payment.types";
import type { Deps } from "./ports";

export async function cancelIntent(deps: Deps, id: string, actor = "core"): Promise<IntentRow> {
  const intent = await deps.intents.byId(id);
  if (!intent) throw new AppError(404, "No encontramos ese cobro.");
  if ((await deps.intents.countApprovedPayments(id)) > 0) throw new AppError(409, "Este cobro ya recibió pagos, no se puede cancelar.", "has_payments");
  if (intent.status === "cancelled") return intent;
  await deps.uow.commit([deps.intents.cancel(id, deps.clock.now())], [{ type: "intent.updated", entity: "intent", id }]);
  await deps.audit.record({ actor, action: "intent.cancelled", entity: "intent", entityId: id });
  return (await deps.intents.byId(id))!;
}
