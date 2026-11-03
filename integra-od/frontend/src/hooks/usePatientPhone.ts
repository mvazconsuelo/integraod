import { useApi } from "./useApi";
import type { Contact } from "@/types";

/** Teléfono (para WhatsApp) del cliente con ese nombre, si está cargado. */
export function usePatientPhone(name: string): string | null {
  const { data } = useApi<Contact[]>("/patients/contacts");
  const key = name.trim().toLowerCase();
  return data?.find((c) => c.name.trim().toLowerCase() === key)?.phone ?? null;
}
