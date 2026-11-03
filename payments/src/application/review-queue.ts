import { AppError } from "../shared/errors";
import type { Deps } from "./ports";

/** Pagos que un proveedor aprobó pero no coinciden con ningún cobro: una persona los revisa. No cuentan como dinero. */
export const listReview = (deps: Deps) => deps.review.listOpen();

export async function dismissReview(deps: Deps, id: string, reason: string, actor = "core") {
  if (!(await deps.review.dismiss(id, reason, deps.clock.now()))) throw new AppError(404, "No encontramos ese pago para revisar.");
  await deps.audit.record({ actor, action: "review.dismissed", entity: "review_item", entityId: id, detail: { reason } });
}
