const KEY = "clinic-admin-token";

export const getToken = () => {
  try { return sessionStorage.getItem(KEY) ?? ""; } catch { return ""; }
};
export const setToken = (t: string) => {
  try { t ? sessionStorage.setItem(KEY, t) : sessionStorage.removeItem(KEY); } catch { /* sin storage */ }
};

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: init.method ?? (init.body ? "POST" : "GET"),
      headers: { "Content-Type": "application/json", ...(init.auth === false ? {} : { Authorization: `Bearer ${getToken()}` }) },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "No pudimos conectarnos. Revisá tu internet e intentá de nuevo.");
  }
  if (res.status === 401 && init.auth !== false) {
    setToken("");
    window.dispatchEvent(new Event("auth-expired"));
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string; code?: string } | null;
    throw new ApiError(res.status, data?.error ?? "Algo salió mal. Intentá de nuevo.", data?.code);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}
