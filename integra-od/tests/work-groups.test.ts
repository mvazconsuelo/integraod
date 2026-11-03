import { describe, expect, it } from "vitest";
import { groupWorks } from "../frontend/src/lib/work-groups";

const b = (id: string, status: string) => ({ id, status: status as "sent" });
const r = (budget_id: string | null, display_status: string) => ({ budget_id, display_status: display_status as "pending" });

describe("grupos de trabajos del Inicio", () => {
  it("cada trabajo cae en un solo grupo", () => {
    const g = groupWorks(
      [b("a", "sent"), b("b", "sent"), b("c", "in_progress"), b("d", "in_progress"), b("e", "completed"), b("f", "cancelled")],
      [r("b", "pending"), r("d", "expired")],
    );
    expect(g).toEqual({ attention: ["d"], inProgress: ["c"], toAnswer: ["a"] });
    const all = [...g.attention, ...g.inProgress, ...g.toAnswer];
    expect(new Set(all).size).toBe(all.length);
  });

  it("un pedido de pago abierto no es un presupuesto esperando respuesta", () => {
    expect(groupWorks([b("a", "sent")], [r("a", "pending")]).toAnswer).toEqual([]);
    expect(groupWorks([b("a", "sent")], [r("a", "partially_paid")]).toAnswer).toEqual([]);
  });

  it("cancelados, cobrados y pedidos sueltos no cuentan; sin datos todo da cero", () => {
    expect(groupWorks([b("e", "completed"), b("f", "cancelled")], [r(null, "expired")])).toEqual({ attention: [], inProgress: [], toAnswer: [] });
    expect(groupWorks([], [])).toEqual({ attention: [], inProgress: [], toAnswer: [] });
  });

  it("un pedido vencido manda al trabajo a 'necesitan atención', aunque ya tenga pagos", () => {
    expect(groupWorks([b("c", "in_progress")], [r("c", "expired")])).toEqual({ attention: ["c"], inProgress: [], toAnswer: [] });
  });
});
