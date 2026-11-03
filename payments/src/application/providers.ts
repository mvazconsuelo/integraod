import { providerContext, type Deps } from "./ports";

export async function listProviders(deps: Deps) {
  const ctx = providerContext(deps);
  return Promise.all(deps.providers.list().map(async (p) => ({ id: p.id, label: p.label, kind: p.kind, connected: await p.isConnected(ctx) })));
}
