import { getToken } from "./api";

/** Descarga un archivo de la API (lleva la clave de acceso, por eso no alcanza con un enlace). */
export async function downloadFile(path: string, fallbackName: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  } catch {
    throw new Error("No pudimos conectarnos. Revisá tu internet e intentá de nuevo.");
  }
  if (!res.ok) throw new Error("No pudimos generar el reporte. Intentá de nuevo.");
  const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
