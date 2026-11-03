import { api } from "@/lib/api";
import type { Settings } from "@/types";

export type ProfileInput = Omit<Settings, "payments_online" | "mp_connected" | "mp_mock">;

export const saveSettings = (s: ProfileInput) => api<Settings>("/settings", { method: "PUT", body: s });
export const mpConnectUrl = () => api<{ url: string }>("/mercadopago/connect");
export const mpDisconnect = () => api("/mercadopago/disconnect", { method: "POST", body: {} });
