import { api } from "@/lib/api";
import type { BudgetDetail, BudgetStatus } from "@/types";
import type { BudgetForm } from "../schemas/budget.schema";

const payload = (f: BudgetForm) => ({ ...f, valid_until: f.valid_until || null });

export const createBudget = (f: BudgetForm) => api<BudgetDetail>("/budgets", { body: payload(f) });
export const updateBudget = (id: string, f: BudgetForm) => api<BudgetDetail>(`/budgets/${id}`, { method: "PUT", body: payload(f) });
/** La persona usó Compartir (no prueba que el cliente lo haya visto). */
export const recordShared = (id: string, channel: string) => api<{ ok: boolean }>(`/budgets/${id}/shared`, { body: { channel } });
/** Respuesta expresa del cliente: cancelar no cuenta como rechazo. */
export const recordAnswer = (id: string, answer: "accepted" | "declined") => api<{ ok: boolean }>(`/budgets/${id}/answer`, { body: { answer } });
/** Cómo se acordó cobrar. Es informativo: no mueve dinero. */
export const setPaymentMode = (id: string, mode: "total" | "advance" | "partial" | null) => api<{ ok: boolean }>(`/budgets/${id}/payment-mode`, { body: { mode } });
/** Regla de negocio: un presupuesto que se cobra por Mercado Pago se pasa a efectivo o transferencia desde su edición (cierra el pedido). */
export const switchToManual = (id: string) => api<BudgetDetail>(`/budgets/${id}/collect-manual`, { body: {} });
export const changeStatus = (id: string, status: BudgetStatus) => api<BudgetDetail>(`/budgets/${id}/status`, { body: { status } });

export const setCollectMethod = (id: string, method: "mercadopago" | "transfer" | "cash" | null) => api<{ ok: boolean }>(`/budgets/${id}/collect-method`, { body: { method } });
