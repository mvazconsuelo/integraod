import { api } from "@/lib/api";
import type { Treatment } from "@/types";

export type TreatmentInput = Pick<Treatment, "name" | "category" | "price_cents">;

export const createTreatment = (t: TreatmentInput) => api<Treatment>("/treatments", { body: t });
export const updateTreatment = (id: string, t: TreatmentInput) => api<Treatment>(`/treatments/${id}`, { method: "PUT", body: t });
export const deleteTreatment = (id: string) => api(`/treatments/${id}`, { method: "DELETE" });

export const renameCategory = (from: string, to: string) => api("/treatments/categories/rename", { body: { from, to } });
export const deleteCategory = (name: string) => api("/treatments/categories/delete", { body: { name } });
