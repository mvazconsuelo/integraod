import { AppError } from "../shared/errors";
import { providerContext, type Deps } from "./ports";

/** URL a la que se envía al consultorio para autorizar su cuenta. */
export async function connectProvider(deps: Deps, id: string): Promise<{ url: string }> {
  const p = deps.providers.get(id);
  if (!p.connectUrl) throw new AppError(409, "Este proveedor no se conecta de esta forma.");
  return { url: await p.connectUrl(providerContext(deps)) };
}

/** Vuelta del proveedor: valida y guarda la conexión (cifrada). */
export async function completeProviderConnection(deps: Deps, id: string, params: URLSearchParams): Promise<void> {
  const p = deps.providers.get(id);
  await p.completeConnection?.(providerContext(deps), params);
  await deps.audit.record({ actor: "owner", action: "provider.connected", entity: "provider", entityId: p.id });
}
