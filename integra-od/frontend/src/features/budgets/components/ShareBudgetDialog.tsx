import { useState } from "react";
import { Download, MessageCircle } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/shared/Field";
import { PHONE_START } from "@/components/shared/NameFields";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/currency";
import { formatPhone, normalizePhone, phoneError, whatsappUrl } from "@/lib/phone";
import { budgetMessage } from "@/lib/whatsapp";
import { recordShared } from "../services/budgets.service";
import { publicLink } from "@/features/payments/services/payments.service";
import type { BudgetDetail, Contact, Settings } from "@/types";

interface Props { open: boolean; onOpenChange: (o: boolean) => void; budget: BudgetDetail; settings: Settings; onDownload: () => void; onChanged: () => void }

/** Abre WhatsApp con el mensaje listo para el cliente. El PDF se adjunta aparte: se descarga y se suma en el chat. */
export function ShareBudgetDialog({ open, onOpenChange, budget: b, settings, onDownload, onChanged }: Props) {
  const clinic = settings.name;
  const phone = b.patient_phone;
  const [newPhone, setNewPhone] = useState(PHONE_START);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Si ya hay un cobro online sin pagar, su link va en el mensaje. El cobro se pide al crear el presupuesto.
  const pending = b.requests.find((r) => r.provider !== "cash" && r.public_id && (r.display_status === "pending" || r.display_status === "partially_paid"));

  const send = async () => {
    setError("");
    let digits = phone;
    if (!digits) {
      digits = normalizePhone(newPhone);
      if (!digits) return setError(phoneError(newPhone) ?? "Ingresá el teléfono del cliente.");
    }
    // WhatsApp se abre ya, en el mismo toque: si se espera a la red, el navegador bloquea la ventana.
    const win = window.open("", "_blank");
    setBusy(true);
    try {
      if (!phone && b.patient_id) await api<Contact>(`/patients/${b.patient_id}`, { method: "PUT", body: { name: b.patient_ref, phone: newPhone, allow_duplicate_phone: true } });
      const advance = pending ? { amountCents: pending.amount_cents, link: publicLink(pending.public_id), kind: pending.kind } : null;
      const url = whatsappUrl(digits, budgetMessage({ patient: b.patient_ref, number: b.number, clinic, advance }));
      if (win) win.location.href = url; else window.location.href = url;
      await recordShared(b.id, "whatsapp").catch(() => undefined); // el hecho de compartir queda registrado
      onChanged();
      onOpenChange(false);
    } catch (e) {
      win?.close();
      setError(e instanceof Error ? e.message : "No pudimos preparar el mensaje.");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Compartir presupuesto"
      footer={<Button className="w-full" disabled={busy} onClick={() => void send()}><MessageCircle size={16} />Abrir WhatsApp</Button>}>
      <div className="space-y-4">
        <div className="rounded-lg bg-soft px-3 py-2 text-sm">
          <p className="font-medium">{b.patient_ref}</p>
          {phone && <p className="text-xs text-muted">{formatPhone(phone)}</p>}
        </div>
        {!phone && (
          <Field required label="Teléfono (WhatsApp)" hint={`${b.patient_ref} todavía no tiene teléfono. Queda guardado para la próxima.`}>
            <Input type="tel" autoComplete="tel" inputMode="tel" enterKeyHint="done" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="351 555 0123" />
          </Field>
        )}

        {pending && <p className="text-sm text-muted">El mensaje incluye el link para pagar {formatMoney(pending.amount_cents)}.</p>}

        <div className="rounded-lg border border-dashed p-3 text-sm">
          <p className="font-medium">El PDF se adjunta aparte</p>
          <p className="mt-1 text-xs text-muted">Descargalo y sumalo al chat de WhatsApp con el clip.</p>
          <Button type="button" size="sm" variant="secondary" className="mt-2" onClick={onDownload}><Download size={14} />Descargar PDF</Button>
        </div>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      </div>
    </Dialog>
  );
}
