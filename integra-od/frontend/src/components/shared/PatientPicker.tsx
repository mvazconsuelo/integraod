import { useEffect, useMemo, useRef, useState } from "react";
import { Phone, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Floating } from "@/components/ui/floating";
import { Field } from "@/components/shared/Field";
import { useApi } from "@/hooks/useApi";
import { api, ApiError } from "@/lib/api";
import { NameFields, PHONE_START, joinName, splitName } from "@/components/shared/NameFields";
import { formatPhone, normalizePhone } from "@/lib/phone";
import type { Contact } from "@/types";

export interface PickedPatient { id: string; name: string }

interface Props {
  value: PickedPatient;
  onChange: (p: PickedPatient) => void;
  error?: string;
  autoFocus?: boolean;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * Elegir un contacto de la lista o cargarlo en el momento (nombre completo y teléfono, los dos obligatorios).
 * Queda guardado: la próxima vez aparece al escribir las primeras letras, con su teléfono.
 */
export function PatientPicker({ value, onChange, error, autoFocus }: Props) {
  const contacts = useApi<Contact[]>("/patients/contacts");
  const list = contacts.data ?? [];
  const [query, setQuery] = useState(value.id ? "" : value.name);
  const [open, setOpen] = useState(false);
  // Alta de un contacto nuevo, o teléfono que le falta a uno ya guardado.
  const [draft, setDraft] = useState<{ id: string | null; name: string; first: string; last: string; phone: string } | null>(null);
  const [formError, setFormError] = useState("");
  const [duplicate, setDuplicate] = useState(false);
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  // Un nombre que viene escrito (presupuestos viejos) se enlaza solo si ya existe en la lista.
  useEffect(() => {
    if (value.id || !value.name || !contacts.data) return;
    const hit = contacts.data.find((c) => norm(c.name) === norm(value.name));
    if (hit?.phone) onChange({ id: hit.id, name: hit.name });
  }, [contacts.data, value.id, value.name, onChange]);

  const selected = value.id ? list.find((c) => c.id === value.id) : undefined;
  const q = norm(query);
  const matches = useMemo(() => list.filter((c) => !q || norm(c.name).includes(q) || (c.phone ?? "").includes(q.replace(/\D/g, "") || "\u0000")).slice(0, 30), [list, q]);
  const exact = list.some((c) => norm(c.name) === q);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  const pick = (c: Contact) => {
    setOpen(false);
    if (c.phone) { setQuery(""); onChange({ id: c.id, name: c.name }); return; }
    setFormError(""); setDuplicate(false);
    setDraft({ id: c.id, name: c.name, first: "", last: "", phone: PHONE_START });
  };

  const save = async (allowDuplicate = false) => {
    if (!draft) return;
    if (!draft.id && (!draft.first.trim() || !draft.last.trim())) return setFormError("Escribí nombre y apellido.");
    const name = draft.id ? draft.name : joinName(draft.first, draft.last);
    if (!normalizePhone(draft.phone)) return setFormError("Ingresá un teléfono válido, con característica. Ej.: 351 555 0123.");
    setBusy(true); setFormError("");
    try {
      const body = { name, phone: draft.phone, allow_duplicate_phone: allowDuplicate };
      const saved = draft.id
        ? await api<Contact>(`/patients/${draft.id}`, { method: "PUT", body })
        : await api<Contact>("/patients", { body });
      await contacts.reload();
      setDraft(null); setQuery(""); setDuplicate(false);
      onChange({ id: saved.id, name: saved.name });
    } catch (e) {
      if (e instanceof ApiError && e.code === "phone_in_use") setDuplicate(true);
      setFormError(e instanceof Error ? e.message : "No pudimos guardar al contacto.");
    } finally { setBusy(false); }
  };

  if (draft) {
    return (
      <div className="space-y-3 rounded-lg border border-dashed bg-soft/40 p-3" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void save(); } }}>
        <p className="text-sm font-medium">{draft.id ? `Falta el teléfono de ${draft.name}` : "Contacto nuevo"}</p>
        {!draft.id && (
        <NameFields autoFocus first={draft.first} last={draft.last} onChange={(n) => setDraft({ ...draft, ...n })} />
        )}
        <Field required label="Teléfono (WhatsApp)" hint="Con característica, sin 0 ni 15. Sirve para enviarle el presupuesto.">
          <Input autoComplete="off" inputMode="tel" autoFocus={!!draft.id} value={draft.phone} onChange={(e) => { setDraft({ ...draft, phone: e.target.value }); setDuplicate(false); }} placeholder="351 555 0123" />
        </Field>
        {formError && <p role="alert" className="text-xs text-danger">{formError}</p>}
        <div className="flex flex-wrap gap-2">
          {duplicate
            ? <Button type="button" size="sm" disabled={busy} onClick={() => void save(true)}>Guardar igual</Button>
            : <Button type="button" size="sm" disabled={busy} onClick={() => void save()}>Guardar contacto</Button>}
          <Button type="button" size="sm" variant="ghost" onClick={() => { setDraft(null); setFormError(""); setDuplicate(false); }}>Cancelar</Button>
        </div>
      </div>
    );
  }

  if (value.id) {
    const name = selected?.name ?? value.name;
    const phone = selected?.phone_display;
    return (
      <Field plain required label="Contacto">
        <div className="flex items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{name}</p>
            {phone && <p className="flex items-center gap-1 text-xs text-muted"><Phone size={12} />{phone}</p>}
          </div>
          <button type="button" onClick={() => { onChange({ id: "", name: "" }); setQuery(""); }} className="shrink-0 cursor-pointer text-sm font-medium text-secondary hover:underline">Cambiar</button>
        </div>
      </Field>
    );
  }

  return (
    <Field required label="Contacto" error={error} hint="Buscá por nombre o teléfono. Si es nuevo, lo cargás acá mismo.">
      <div ref={root} className="relative">
        <Input
          autoFocus={autoFocus} autoComplete="off" value={query} placeholder="Nombre y apellido"
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }} onClick={() => setOpen(true)} onBlur={() => setOpen(false)}
          onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
        />
        {open && (matches.length > 0 || (query.trim() && !exact)) && (
          <Floating anchor={root} maxHeight={240} className="p-1" onMouseDown={(e) => e.preventDefault()}>
            <ul role="listbox">
              {matches.map((c) => (
                <li key={c.id} role="option" aria-selected={false}>
                  <button type="button" onClick={() => pick(c)} className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-soft">
                    <span className="min-w-0 truncate">{c.name}</span>
                    <span className="shrink-0 text-xs text-muted">{c.phone_display ?? "Sin teléfono"}</span>
                  </button>
                </li>
              ))}
              {query.trim() && !exact && (
                <li>
                  <button type="button" onClick={() => { setOpen(false); setFormError(""); setDuplicate(false); setDraft({ id: null, name: "", ...splitName(query), phone: PHONE_START }); }} className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm font-medium text-primary hover:bg-soft">
                    <span className="min-w-0 truncate">Crear «{query.trim()}»</span><Plus size={16} className="shrink-0" />
                  </button>
                </li>
              )}
            </ul>
          </Floating>
        )}
      </div>
    </Field>
  );
}
