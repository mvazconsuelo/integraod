import { AppError } from "../shared/errors";
import type { PaymentRow } from "../domain/payment.types";
import type { Deps } from "./ports";
import { reversePayment } from "./reverse-payment";

/** Anula un pago manual. Los de un proveedor se anulan desde el proveedor (reembolso) y llegan por aviso. */
export async function voidPayment(deps: Deps, id: string, reason: string, actor = "core"): Promise<PaymentRow> {
  const p = await deps.payments.byId(id);
  if (!p) throw new AppError(404, "No encontramos ese pago.");
  if (p.source === "provider") throw new AppError(409, "Los pagos de un proveedor se anulan desde el proveedor (reembolso).", "provider_payment");
  if (!(await reversePayment(deps, p, "voided", reason, actor))) throw new AppError(409, "Ese pago ya estaba anulado.");
  return (await deps.payments.byId(id))!;
}
