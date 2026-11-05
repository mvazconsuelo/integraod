import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import { Phone, Plus, Search } from "lucide-react";
import { Avatar } from "@/components/shared/Avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Floating } from "@/components/ui/floating";
import { Field } from "@/components/shared/Field";
import { useApi } from "@/hooks/useApi";
import { api, ApiError } from "@/lib/api";
import { NameFields, PHONE_START, joinName, phoneOrEmpty, splitName } from "@/components/shared/NameFields";
import { formatPhone, phoneError } from "@/lib/phone";
import type { Contact } from "@/types";

export interface PickedPatient { id: string; name: string }

export interface PickerHandle { /** Hay un cliente nuevo a medio cargar. */ hasDraft: () => boolean; /** Lo guarda; true si quedó guardado y elegido. */ save: () => Promise<boolean> }

interface Props {
  /** Para que quien lo usa pueda guardar el cliente nuevo al tocar "Continuar". */
  handle?: Ref<PickerHandle>;
  value: PickedPatient;
  onChange: (p: PickedPatient) => void;
  error?: string;
  autoFocus?: boolean;
  /** Avisa cuando se abre o se cierra el alta de un cliente nuevo. */
  onDraftChange?: (open: boolean) => void;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * Elegir un cliente de la lista o cargarlo en el momento (nombre completo y teléfono, los dos obligatorios).
 * Queda guardado: la próxima vez aparece al escribir las primeras letras, con su teléfono.
 */
export function PatientPicker({ value, onChange, error, autoFocus, handle, onDraftChange }: Props) {
  const contacts = useApi<Contact[]>("/patients/contacts");
  const list = contacts.data ?? [];
  const [query, setQuery] = useState(value.id ? "" : value.name);
  const [open, setOpen] = useState(false);
  // Alta de un cliente nuevo, o teléfono que le falta a uno ya guardado.
  const [draft, setDraft] = useState<{ id: string | null; name: string; first: string; last: string; phone: string } | null>(null);
  const [formError, setFormError] = useState("");
  const [duplicate, setDuplicate] = useState(false);
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => { onDraftChange?.(draft !== null); }, [draft !== null]); // eslint-disable-line react-hooks/exhaustive-deps

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
    setQuery(""); onChange({ id: c.id, name: c.name }); // el teléfono se pide recién al compartir
  };

  const save = async (allowDuplicate = false): Promise<boolean> => {
    if (!draft) return false;
    if (!draft.first.trim() || !draft.last.trim()) { setFormError("Escribí nombre y apellido."); return false; }
    const name = joinName(draft.first, draft.last);
    const phone = phoneOrEmpty(draft.phone);
    const problem = phone ? phoneError(phone) : null;
    if (problem) { setFormError(problem); return false; }
    setBusy(true); setFormError("");
    try {
      const saved = await api<Contact>("/patients", { body: { name, phone, allow_duplicate_phone: allowDuplicate } });
      await contacts.reload();
      setDraft(null); setQuery(""); setDuplicate(false);
      onChange({ id: saved.id, name: saved.name });
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.code === "phone_in_use") setDuplicate(true);
      setFormError(e instanceof Error ? e.message : "No pudimos guardar al destinatario.");
      return false;
    } finally { setBusy(false); }
  };

  useImperativeHandle(handle, () => ({ hasDraft: () => draft !== null, save: () => save() }));

  if (draft) {
    return (
      <div className="space-y-3 rounded-lg border border-dashed bg-soft/40 p-3" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void save(); } }}>
        <p className="text-sm font-medium">Destinatario nuevo</p>
        <NameFields autoFocus first={draft.first} last={draft.last} onChange={(n) => setDraft({ ...draft, ...n })} />
        <Field label="Teléfono (opcional)" hint="Solo hace falta para enviarle el presupuesto por WhatsApp.">
          <Input type="tel" autoComplete="tel" inputMode="tel" enterKeyHint="done" value={draft.phone} onChange={(e) => { setDraft({ ...draft, phone: e.target.value }); setDuplicate(false); }} placeholder="351 555 0123" />
        </Field>
        {formError && <p role="alert" className="text-xs text-danger">{formError}</p>}
        <div className="flex flex-wrap gap-2">
          {duplicate
            ? <Button type="button" size="sm" disabled={busy} onClick={() => void save(true)}>Guardar igual</Button>
            : <Button type="button" size="sm" disabled={busy} onClick={() => void save()}>Guardar destinatario</Button>}
          <Button type="button" size="sm" variant="ghost" onClick={() => { setDraft(null); setFormError(""); setDuplicate(false); }}>Cancelar</Button>
        </div>
      </div>
    );
  }

  if (value.id) {
    const name = selected?.name ?? value.name;
    const phone = selected?.phone_display;
    return (
      <Field plain required label="Destinatario">
        <div className="flex items-center gap-3 rounded-2xl border bg-white px-3 py-2.5">
          <Avatar name={name} />
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold [overflow-wrap:anywhere]">{name}</p>
            {phone && <p className="flex items-center gap-1 text-xs text-muted"><Phone size={12} />{phone}</p>}
          </div>
          <button type="button" onClick={() => { onChange({ id: "", name: "" }); setQuery(""); }} className="shrink-0 cursor-pointer text-sm font-medium text-secondary hover:underline">Cambiar</button>
        </div>
      </Field>
    );
  }

  return (
    <Field required label="Destinatario" error={error}>
      <div ref={root} className="relative">
        <Search size={18} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <Input
          className="h-12 [@media(max-height:620px)]:h-11 pl-10 text-base" autoFocus={autoFocus} autoComplete="off" enterKeyHint="search" value={query} placeholder="Nombre y apellido"
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }} onClick={() => setOpen(true)} onBlur={() => setOpen(false)}
          onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
        />
        {open && query.trim() !== "" && (matches.length > 0 || !exact) && ( // solo al buscar: sin texto no se muestra la lista
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
                <li className={matches.length > 0 ? "mt-1 border-t pt-1" : undefined}>
                  <button type="button" onClick={() => { setOpen(false); setFormError(""); setDuplicate(false); setDraft({ id: null, name: "", ...splitName(query), phone: PHONE_START }); }}
                    className="flex w-full cursor-pointer items-center gap-3 rounded-md bg-primary/10 px-3 py-3 text-left text-sm font-semibold text-primary hover:bg-primary/15">
                    <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-white"><Plus size={16} /></span>
                    <span className="min-w-0 truncate">Crear nuevo destinatario</span>
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
