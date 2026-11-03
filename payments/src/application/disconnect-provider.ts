import { providerContext, type Deps } from "./ports";

export async function disconnectProvider(deps: Deps, id: string, actor = "core"): Promise<void> {
  const p = deps.providers.get(id);
  await p.disconnect?.(providerContext(deps));
  await deps.audit.record({ actor, action: "provider.disconnected", entity: "provider", entityId: p.id });
}
