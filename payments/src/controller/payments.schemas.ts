import { z } from "zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const kind = z.enum(["advance", "partial", "final"]);
const text = (max: number) => z.string().trim().min(1).max(max);

export const createIntentSchema = z.object({ method: z.enum(["online", "cash"]).default("online"), reference: text(120), description: text(200), payerLabel: text(120), amountCents: z.number().int().positive().max(10_000_000_000), kind, dueDate: date.nullable() });
export const manualPaymentSchema = z.object({
  idempotencyKey: z.string().min(8).max(64), intentId: z.string().max(64).nullable(), reference: text(120), payerLabel: text(120), concept: text(200),
  amountCents: z.number().int().positive().max(10_000_000_000), method: z.enum(["cash", "transfer"]), kind, paidAt: z.string().datetime({ offset: true }).optional(), notes: z.string().max(500),
});
export const reasonSchema = z.object({ reason: text(300) });
export const mockPaySchema = z.object({ outcome: z.enum(["approved", "rejected", "pending"]) });
