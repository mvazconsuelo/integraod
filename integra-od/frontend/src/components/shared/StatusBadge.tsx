import { cn } from "@/lib/utils";
import { BUDGET_STATUS_LABEL, REQUEST_STATUS_LABEL } from "@/lib/formatters";

const TONE: Record<string, string> = {
  paid: "bg-success/10 text-success", completed: "bg-success/10 text-success",
  pending: "bg-warning/10 text-[#8a5d2b]", partially_paid: "bg-warning/10 text-[#8a5d2b]", in_progress: "bg-warning/10 text-[#8a5d2b]",
  expired: "bg-danger/10 text-danger", cancelled: "bg-[#E8EAEE] text-[#5B6272]", voided: "bg-border text-muted", refunded: "bg-border text-muted",
  draft: "bg-border text-muted", sent: "bg-soft text-secondary",
};

export function StatusBadge({ status, kind = "request" }: { status: string; kind?: "request" | "budget" }) {
  const label = kind === "budget" ? BUDGET_STATUS_LABEL[status] : (REQUEST_STATUS_LABEL[status] ?? ({ voided: "Anulado", refunded: "Reembolsado" } as Record<string, string>)[status]);
  return <span className={cn("inline-flex rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap", TONE[status] ?? "bg-border text-muted")}>{label ?? status}</span>;
}
