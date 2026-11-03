import { api } from "@/lib/api";
import type { BudgetDetail, BudgetStatus } from "@/types";
import type { BudgetForm } from "../schemas/budget.schema";

const payload = (f: BudgetForm) => ({ ...f, valid_until: f.valid_until || null });

export const createBudget = (f: BudgetForm) => api<BudgetDetail>("/budgets", { body: payload(f) });
export const updateBudget = (id: string, f: BudgetForm) => api<BudgetDetail>(`/budgets/${id}`, { method: "PUT", body: payload(f) });
export const changeStatus = (id: string, status: BudgetStatus) => api<BudgetDetail>(`/budgets/${id}/status`, { body: { status } });
