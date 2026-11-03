import { describe, expect, it } from "vitest";
import { groupWorks } from "../frontend/src/lib/work-groups";
import { deriveSituation } from "../worker/src/utils/money";

type S = Parameters<typeof groupWorks>[0][number]["situation"];
const b = (id: string, situation: S) => ({ id, situation });

describe("grupos de trabajos del Inicio (la situación la decide el servidor)", () => {
  it("cada presupuesto cae en un solo grupo y los demás no se cuentan", () => {
    const all = [b("a", "to_answer"), b("b", "awaiting_payment"), b("c", "in_progress"), b("d", "attention"), b("e", "completed"), b("f", "cancelled"), b("g", "not_shared"), b("h", "declined")];
    const g = groupWorks(all);
    expect(g).toEqual({ attention: ["d"], awaitingPayment: ["b"], inProgress: ["c"], toAnswer: ["a"] });
    const counted = Object.values(g).flat();
    expect(new Set(counted).size).toBe(counted.length); // nadie dos veces
  });
  it("sin datos todo da cero", () => {
    expect(groupWorks([])).toEqual({ attention: [], awaitingPayment: [], inProgress: [], toAnswer: [] });
  });
});

describe("prioridad de la situación (deriveSituation)", () => {
  const base = { status: "sent", answer: null, shared_at: null, open_requests: 0, expired_requests: 0 };
  it("finales primero, después atención, pedido vigente, en curso, por responder y sin compartir", () => {
    expect(deriveSituation({ ...base, status: "cancelled", expired_requests: 1 })).toBe("cancelled");
    expect(deriveSituation({ ...base, status: "completed", open_requests: 1 })).toBe("completed");
    expect(deriveSituation({ ...base, answer: "declined", shared_at: "x" })).toBe("declined");
    expect(deriveSituation({ ...base, status: "in_progress", expired_requests: 1, open_requests: 1 })).toBe("attention");
    expect(deriveSituation({ ...base, status: "in_progress", open_requests: 1 })).toBe("awaiting_payment");
    expect(deriveSituation({ ...base, status: "in_progress" })).toBe("in_progress");
    expect(deriveSituation({ ...base, shared_at: "x" })).toBe("to_answer");
    expect(deriveSituation(base)).toBe("not_shared");
  });
});
