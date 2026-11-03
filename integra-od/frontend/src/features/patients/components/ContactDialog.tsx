import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/shared/Field";
import { NameFields, PHONE_START, joinName, splitName } from "@/components/shared/NameFields";
import { api, ApiError } from "@/lib/api";
import { normalizePhone } from "@/lib/phone";
import type { Contact } from "@/types";

interface Props { open: boolean; onOpenChange: (o: boolean) => void; contact?: Contact; /** Para crear uno nuevo: sin contacto. */ onSaved: (c: Contact) => void }

/** Agregar un contacto, o cambiar su nombre o teléfono. El nombre nuevo se actualiza en todos sus presupuestos y cobros. */
export function ContactDialog({ open, onOpenChange, contact, onSaved }: Props) {
  const [names, setNames] = useState(splitName(contact?.name ?? ""));
  const [phone, setPhone] = useState(contact?.phone_display ?? PHONE_START);
  const [duplicate, setDuplicate] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async (allowDuplicate = false) => {
    if (!names.first.trim() || !names.last.trim()) return setError("Escribí nombre y apellido.");
    const name = joinName(names.first, names.last);
    if (!normalizePhone(phone)) return setError("Ingresá un teléfono válido, con característica. Ej.: 351 555 0123.");
    setBusy(true); setError("");
    try {
      const body = { name, phone, allow_duplicate_phone: allowDuplicate };
      const saved = contact ? await api<Contact>(`/patients/${contact.id}`, { method: "PUT", body }) : await api<Contact>("/patients", { body });
      onSaved(saved);
      onOpenChange(false);
    } catch (e) {
      setDuplicate(e instanceof ApiError && e.code === "phone_in_use");
      setError(e instanceof Error ? e.message : "No pudimos guardar los cambios.");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={contact ? "Editar contacto" : "Nuevo contacto"}
      footer={<Button form="contact-form" className="w-full" disabled={busy}>{duplicate ? "Guardar igual" : contact ? "Guardar cambios" : "Guardar contacto"}</Button>}>
      <form id="contact-form" className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save(duplicate); }}>
        <NameFields autoFocus={!contact} first={names.first} last={names.last} onChange={setNames} />
        <Field required label="Teléfono (WhatsApp)"><Input autoComplete="off" inputMode="tel" value={phone} onChange={(e) => { setPhone(e.target.value); setDuplicate(false); }} /></Field>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      </form>
    </Dialog>
  );
}
