import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/shared/Field";
import { voidAt } from "../services/payments.service";

interface Props { open: boolean; onOpenChange: (o: boolean) => void; title: string; path: string; onDone: () => void; description?: string; confirmLabel?: string; placeholder?: string; tone?: "danger" | "primary" }

/** Anular no borra: deja el movimiento original y registra el motivo. */
export function VoidDialog({ open, onOpenChange, title, path, onDone, description = "El movimiento queda en el historial marcado como anulado.", confirmLabel = "Anular", placeholder = "Ej: lo cargué por error", tone = "danger" }: Props) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try { await voidAt(path, reason); onOpenChange(false); onDone(); } catch (err) { setError(err instanceof Error ? err.message : "No pudimos anular."); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} description={description}>
      <form onSubmit={submit} className="space-y-4">
        <Field required label="Motivo"><Input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder={placeholder} /></Field>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <Button variant={tone} className="w-full" disabled={busy || !reason.trim()}>{confirmLabel}</Button>
      </form>
    </Dialog>
  );
}
