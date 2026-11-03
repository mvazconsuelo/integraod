import { useState } from "react";
import { ChevronDown, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SuggestInput } from "@/components/ui/suggest-input";
import { cn } from "@/lib/utils";
import { AmountField } from "@/components/shared/AmountField";
import { ErrorMessage, Loading } from "@/components/feedback/ErrorMessage";
import { useApi } from "@/hooks/useApi";
import type { Treatment } from "@/types";
import { createTreatment, deleteCategory, deleteTreatment, renameCategory, updateTreatment, type TreatmentInput } from "../services/treatments.service";

type Run = (fn: () => Promise<unknown>) => Promise<void>;

/** Listado de servicios con precios propios: se puede agregar, editar y eliminar todo. */
export function TreatmentCatalogCard() {
  const { data, error, loading, reload } = useApi<Treatment[]>("/treatments");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState(0);
  const [formKey, setFormKey] = useState(0);
  const [msg, setMsg] = useState("");

  const categories = [...new Set((data ?? []).map((t) => t.category))];
  const run: Run = async (fn) => {
    try { await fn(); setMsg(""); await reload(); } catch (e) { setMsg(e instanceof Error ? e.message : "No pudimos guardar."); }
  };

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await createTreatment({ name, category, price_cents: price });
      setName(""); setPrice(0); setFormKey((k) => k + 1);
    });
  };

  return (
    <Card className="p-5 space-y-4">
      <div>
        <h2 className="text-base font-semibold">Listado de servicios</h2>
        <p className="text-sm text-muted mt-1">Agregá, editá o eliminá lo que quieras. Los cambios de este listado se guardan al instante y no modifican presupuestos ya creados.</p>
      </div>
      {error && <ErrorMessage message={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {msg && <p role="alert" className="text-sm text-danger">{msg}</p>}

      {categories.map((c) => (
        <CategoryGroup key={c} name={c} items={data!.filter((t) => t.category === c)} categories={categories} run={run} defaultOpen={categories.length <= 1} />
      ))}

      <form onSubmit={add} className="rounded-lg bg-soft/50 p-4 space-y-3">
        <p className="text-sm font-medium">Agregar servicio</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_180px_150px_auto] items-end">
          <Input aria-label="Nombre" placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
          <SuggestInput ariaLabel="Categoría" placeholder="Categoría (existente o nueva)" suggestions={categories} value={category} onChange={setCategory} />
          <AmountField key={formKey} valueCents={price} onChange={setPrice} placeholder="Precio" />
          <Button disabled={!name.trim() || !category.trim()}><Plus size={16} />Agregar</Button>
        </div>
      </form>
    </Card>
  );
}

function CategoryGroup({ name, items, categories, run, defaultOpen }: { name: string; items: Treatment[]; categories: string[]; run: Run; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(name);
  const [confirming, setConfirming] = useState(false);

  const saveName = (e: React.FormEvent) => {
    e.preventDefault();
    if (newName.trim() && newName.trim() !== name) void run(() => renameCategory(name, newName.trim()));
    setRenaming(false);
  };

  return (
    <div className="rounded-lg border">
      <div className="flex flex-wrap items-center justify-between gap-2 pr-2">
        {renaming ? (
          <form onSubmit={saveName} className="flex items-center gap-2 p-2">
            <Input autoFocus aria-label="Nuevo nombre de la categoría" value={newName} onChange={(e) => setNewName(e.target.value)} className="h-8 w-48" />
            <Button size="sm">Guardar</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => { setRenaming(false); setNewName(name); }}>Cancelar</Button>
          </form>
        ) : (
          <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex min-w-40 flex-1 items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium cursor-pointer">
            <span>{name} <span className="text-muted font-normal">({items.length})</span></span>
            <ChevronDown size={16} className={cn("text-muted transition-transform", open && "rotate-180")} />
          </button>
        )}
        {!renaming && (confirming ? (
          <span className="flex items-center gap-2 text-xs">
            Se eliminan sus {items.length} servicios.
            <Button type="button" size="sm" variant="danger" onClick={() => void run(() => deleteCategory(name))}>Eliminar</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>No</Button>
          </span>
        ) : (
          <span className="flex gap-1">
            <Button type="button" size="sm" variant="ghost" onClick={() => setRenaming(true)}><Pencil size={14} />Renombrar</Button>
            <Button type="button" size="sm" variant="ghost" aria-label={`Eliminar categoría ${name}`} onClick={() => setConfirming(true)}><Trash2 size={14} /></Button>
          </span>
        ))}
      </div>
      {open && (
        <ul className="divide-y border-t">
          {items.map((t) => <Row key={`${t.id}:${t.name}:${t.category}:${t.price_cents}`} t={t} categories={categories} run={run} />)}
        </ul>
      )}
    </div>
  );
}

function Row({ t, categories, run }: { t: Treatment; categories: string[]; run: Run }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [draft, setDraft] = useState<TreatmentInput>({ name: t.name, category: t.category, price_cents: t.price_cents });
  const [price, setPrice] = useState(t.price_cents);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    void run(() => updateTreatment(t.id, { ...draft, name: draft.name.trim(), category: draft.category.trim() }));
    setEditing(false);
  };

  if (editing) {
    return (
      <li className="px-4 py-3">
        <form onSubmit={save} className="grid gap-3 sm:grid-cols-[1fr_170px_140px_auto] items-end">
          <Input autoFocus aria-label="Nombre" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <SuggestInput ariaLabel="Categoría" suggestions={categories} value={draft.category} onChange={(v) => setDraft({ ...draft, category: v })} />
          <AmountField valueCents={draft.price_cents} onChange={(c) => setDraft({ ...draft, price_cents: c })} placeholder="Precio" />
          <div className="flex gap-2">
            <Button disabled={!draft.name.trim() || !draft.category.trim()}>Guardar</Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>Cancelar</Button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
      <span className="flex-1 min-w-40">{t.name}</span>
      <div className="w-36" onBlur={() => price !== t.price_cents && void run(() => updateTreatment(t.id, { name: t.name, category: t.category, price_cents: price }))}>
        <AmountField valueCents={price} onChange={setPrice} placeholder="Sin precio" />
      </div>
      {confirming ? (
        <span className="flex items-center gap-2 text-xs">¿Eliminar?
          <Button type="button" size="sm" variant="danger" onClick={() => void run(() => deleteTreatment(t.id))}>Sí</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>No</Button>
        </span>
      ) : (
        <span className="flex gap-1">
          <Button type="button" size="icon" variant="ghost" aria-label={`Editar ${t.name}`} onClick={() => setEditing(true)}><Pencil size={16} /></Button>
          <Button type="button" size="icon" variant="ghost" aria-label={`Eliminar ${t.name}`} onClick={() => setConfirming(true)}><Trash2 size={16} /></Button>
        </span>
      )}
    </li>
  );
}
