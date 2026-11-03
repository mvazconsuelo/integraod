import { cn } from "@/lib/utils";
import { BUDGET_STATUS_LABEL, REQUEST_STATUS_LABEL } from "@/lib/formatters";

// Cada estado es una píldora suave con un punto y la palabra: el color acompaña, nunca es lo único que dice.
const TONE: Record<string, { pill: string; dot: string }> = {
  success: { pill: "bg-success/10 text-success", dot: "bg-success" },
  warning: { pill: "bg-warning/15 text-[#8a5d2b]", dot: "bg-warning" },
  danger: { pill: "bg-danger/10 text-danger", dot: "bg-danger" },
  muted: { pill: "bg-soft text-muted", dot: "bg-muted" },
};
const OF: Record<string, keyof typeof TONE> = {
  paid: "success", completed: "success",
  pending: "warning", partially_paid: "warning", in_progress: "warning",
  expired: "danger", cancelled: "muted", voided: "muted", refunded: "muted", draft: "muted", sent: "muted",
};

export function StatusBadge({ status, kind = "request" }: { status: string; kind?: "request" | "budget" }) {
  const label = kind === "budget" ? BUDGET_STATUS_LABEL[status] : (REQUEST_STATUS_LABEL[status] ?? ({ voided: "Anulado", refunded: "Reembolsado" } as Record<string, string>)[status]);
  const t = TONE[OF[status] ?? "muted"];
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold", t.pill)}>
      <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", t.dot)} />{label ?? status}
    </span>
  );
}
