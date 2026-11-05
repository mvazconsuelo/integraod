/**
 * El nombre y el logo del negocio de la última vez, guardados en el navegador: al recargar se muestran al instante,
 * sin pasar por un logo "por defecto" mientras llegan los datos. Es solo comodidad visual: el dato verdadero viene del servidor.
 */
const KEY = "integraod.brand";
export interface BrandCache { name: string; logo_url: string | null }

export function readBrand(): BrandCache | null {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as BrandCache | null; return v && typeof v.name === "string" ? v : null; } catch { return null; }
}
export function writeBrand(b: BrandCache) {
  try { localStorage.setItem(KEY, JSON.stringify({ name: b.name, logo_url: b.logo_url })); } catch { /* sin almacenamiento: no pasa nada */ }
}
