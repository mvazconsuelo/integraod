import { useMemo, useRef, useState } from "react";
import { Check, FolderPlus, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AmountField } from "@/components/shared/AmountField";
import { ErrorMessage, Loading } from "@/components/feedback/ErrorMessage";
import { useApi } from "@/hooks/useApi";
import { cn } from "@/lib/utils";
import type { Treatment } from "@/types";
import { createTreatment, deleteCategory, deleteTreatment, renameCategory, updateTreatment } from "../services/treatments.service";

const ALL = "\u0000todos";
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * Servicios y precios, para gestionar desde la computadora: las categorías a la izquierda, los servicios de la elegida a la derecha.
 * Un servicio siempre se agrega DENTRO de una categoría (no hay que elegirla de nuevo). Una categoría nueva queda guardada
 * cuando se le agrega su primer servicio.
 */
export function ServicesManager() {
  const { data, error, loading, reload } = useApi<Treatment[]>("/treatments");
  const [selected, setSelected] = useState(ALL);
  const [drafts, setDrafts] = useState<string[]>([]);   // categorías nuevas que todavía no tienen ningún servicio
  const [creating, setCreating] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState("");

  const items = data ?? [];
  const saved = useMemo(() => [...new Set(items.map((t) => t.category))].sort((a, b) => a.localeCompare(b, "es")), [items]);
  const categories = useMemo(() => [...saved, ...drafts.filter((d) => !saved.some((s) => norm(s) === norm(d)))], [saved, drafts]);
  const current = selected === ALL ? null : categories.find((c) => c === selected) ?? null;
  const countOf = (c: string) => items.filter((t) => t.category === c).length;

  const run = async (fn: () => Promise<unknown>) => {
    try { await fn(); setMsg(""); await reload(); } catch (e) { setMsg(e instanceof Error ? e.message : "No pudimos guardar."); }
  };

  const createCategory = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newCat.trim();
    if (!name) return;
    const exists = categories.find((c) => norm(c) === norm(name));
    if (!exists) setDrafts((d) => [...d, name]);
    setSelected(exists ?? name); setNewCat(""); setCreating(false); setQ("");
  };

  const rows = items
    .filter((t) => (current ? t.category === current : true))
    .filter((t) => !q.trim() || norm(t.name).includes(norm(q)) || norm(t.category).includes(norm(q)))
    .sort((a, b) => a.category.localeCompare(b.category, "es") || a.position - b.position);

  return (
    <section aria-label="Servicios y precios" className="space-y-4 border-t pt-6">
      <div>
        <h3 className="text-base font-semibold">Servicios y precios</h3>
        <p className="mt-1 text-sm text-muted">Armá tu listado por categorías. Se sugieren mientras armás un presupuesto. Los cambios se guardan al instante y no tocan presupuestos ya creados.</p>
      </div>
      {error && <ErrorMessage message={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {msg && <p role="alert" className="text-sm text-danger">{msg}</p>}

      {data && (
        <div className="grid min-h-[22rem] grid-cols-[14rem_1fr] overflow-hidden rounded-2xl border bg-white">
          {/* Categorías */}
          <nav aria-label="Categorías" className="flex flex-col gap-1 border-r bg-soft/40 p-3">
            <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted">Categorías</p>
            <CategoryButton label="Todos los servicios" count={items.length} active={!current} onClick={() => setSelected(ALL)} />
            {categories.map((c) => <CategoryButton key={c} label={c} count={countOf(c)} active={current === c} onClick={() => { setSelected(c); setQ(""); }} />)}
            <div className="mt-2 border-t pt-3">
              {creating ? (
                <form onSubmit={createCategory} className="space-y-2">
                  <Input autoFocus aria-label="Nombre de la categoría nueva" placeholder="Nombre de la categoría" value={newCat} onChange={(e) => setNewCat(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setCreating(false)} className="h-9" />
                  <div className="flex gap-2"><Button size="sm" disabled={!newCat.trim()}><Check size={14} />Crear</Button><Button type="button" size="sm" variant="ghost" onClick={() => { setCreating(false); setNewCat(""); }}>Cancelar</Button></div>
                </form>
              ) : (
                <Button type="button" variant="secondary" size="sm" className="w-full" onClick={() => setCreating(true)}><FolderPlus size={15} />Nueva categoría</Button>
              )}
            </div>
          </nav>

          {/* Servicios */}
          <div className="flex min-w-0 flex-col">
            {categories.length === 0 && !creating ? (
              <div className="grid flex-1 place-items-center p-8 text-center">
                <div className="max-w-xs space-y-3">
                  <p className="font-semibold">Todavía no hay categorías</p>
                  <p className="text-sm text-muted">Creá la primera (por ejemplo, el tipo de servicio) y después agregale sus servicios con su precio.</p>
                  <Button onClick={() => setCreating(true)}><FolderPlus size={16} />Crear la primera categoría</Button>
                </div>
              </div>
            ) : (
              <>
                <Header current={current} count={current ? countOf(current) : items.length} setSelected={setSelected} setDrafts={setDrafts} run={run} />
                <div className="border-b px-4 py-2.5">
                  <div className="relative max-w-sm"><Search size={15} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><Input aria-label="Buscar servicio" placeholder={current ? "Buscar en esta categoría" : "Buscar por servicio o categoría"} value={q} onChange={(e) => setQ(e.target.value)} className="h-9 pl-9" /></div>
                </div>
                <ul className="flex-1 divide-y">
                  {rows.map((t) => <ServiceRow key={`${t.id}:${t.name}:${t.category}:${t.price_cents}`} t={t} showCategory={!current} categories={categories} run={run} />)}
                  {rows.length === 0 && <li className="px-5 py-6 text-sm text-muted">{q ? "No encontramos nada con esa búsqueda." : current ? "Esta categoría todavía no tiene servicios. Agregá el primero acá abajo para guardarla." : "Todavía no hay servicios."}</li>}
                </ul>
                {current ? <AddRow category={current} run={async (fn) => { await run(fn); setDrafts((d) => d.filter((x) => norm(x) !== norm(current))); }} /> : categories.length > 0 && <p className="border-t bg-soft/30 px-5 py-3 text-sm text-muted">Elegí una categoría de la izquierda para agregarle servicios.</p>}
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function CategoryButton({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-current={active ? "true" : undefined} onClick={onClick}
      className={cn("flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition", active ? "bg-primary font-semibold text-white" : "hover:bg-soft")}>
      <span className="truncate">{label}</span><span className={cn("shrink-0 text-xs tabular", active ? "text-white/80" : "text-muted")}>{count}</span>
    </button>
  );
}

/** Título de lo que se está viendo y, si es una categoría, renombrarla o eliminarla. */
function Header({ current, count, setSelected, setDrafts, run }: { current: string | null; count: number; setSelected: (c: string) => void; setDrafts: React.Dispatch<React.SetStateAction<string[]>>; run: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(current ?? "");
  const [confirming, setConfirming] = useState(false);
  if (!current) return <div className="border-b px-5 py-3"><h4 className="font-semibold">Todos los servicios <span className="font-normal text-muted">({count})</span></h4></div>;

  const rename = (e: React.FormEvent) => {
    e.preventDefault();
    const to = name.trim();
    setRenaming(false);
    if (!to || to === current) return;
    if (count === 0) { setDrafts((d) => d.map((x) => (x === current ? to : x))); setSelected(to); return; }
    void run(() => renameCategory(current, to)).then(() => setSelected(to));
  };
  const remove = () => {
    setConfirming(false);
    if (count === 0) { setDrafts((d) => d.filter((x) => x !== current)); setSelected(ALL); return; }
    void run(() => deleteCategory(current)).then(() => setSelected(ALL));
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
      {renaming ? (
        <form onSubmit={rename} className="flex items-center gap-2">
          <Input autoFocus aria-label="Nuevo nombre de la categoría" value={name} onChange={(e) => setName(e.target.value)} className="h-9 w-56" />
          <Button size="sm">Guardar</Button><Button type="button" size="sm" variant="ghost" onClick={() => { setRenaming(false); setName(current); }}>Cancelar</Button>
        </form>
      ) : (
        <h4 className="font-semibold">{current} <span className="font-normal text-muted">({count})</span></h4>
      )}
      {!renaming && (confirming ? (
        <span className="flex items-center gap-2 text-sm">
          {count > 0 ? <>Se eliminan sus <strong>{count}</strong> {count === 1 ? "servicio" : "servicios"}.</> : "Se quita la categoría."}
          <Button type="button" size="sm" variant="danger" onClick={remove}>Eliminar</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>No</Button>
        </span>
      ) : (
        <span className="flex gap-1">
          <Button type="button" size="sm" variant="ghost" onClick={() => { setName(current); setRenaming(true); }}><Pencil size={14} />Renombrar</Button>
          <Button type="button" size="sm" variant="ghost" aria-label={`Eliminar categoría ${current}`} onClick={() => setConfirming(true)}><Trash2 size={14} />Eliminar categoría</Button>
        </span>
      ))}
    </div>
  );
}

/** Una fila para agregar un servicio a la categoría elegida: nombre, precio y Enter. */
function AddRow({ category, run }: { category: string; run: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState(0);
  const [key, setKey] = useState(0);
  const nameRef = useRef<HTMLInputElement>(null);
  const add = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!name.trim()) return;
    void run(() => createTreatment({ name: name.trim(), category, price_cents: price })).then(() => { setName(""); setPrice(0); setKey((k) => k + 1); nameRef.current?.focus(); });
  };
  return (
    <form onSubmit={add} className="flex flex-wrap items-center gap-3 border-t bg-soft/40 px-5 py-3">
      <Input ref={nameRef} aria-label="Nombre del servicio" placeholder={`Agregar un servicio a «${category}»`} value={name} onChange={(e) => setName(e.target.value)} className="h-9 min-w-56 flex-1" />
      <div className="w-40"><AmountField key={key} compact valueCents={price} onChange={setPrice} placeholder="Precio" onEnter={() => add()} /></div>
      <Button disabled={!name.trim()}><Plus size={16} />Agregar</Button>
    </form>
  );
}

function ServiceRow({ t, showCategory, categories, run }: { t: Treatment; showCategory: boolean; categories: string[]; run: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [draft, setDraft] = useState({ name: t.name, category: t.category, price_cents: t.price_cents });
  const [price, setPrice] = useState(t.price_cents);

  if (editing) {
    return (
      <li className="px-5 py-3">
        <form onSubmit={(e) => { e.preventDefault(); void run(() => updateTreatment(t.id, { ...draft, name: draft.name.trim() })); setEditing(false); }} className="flex flex-wrap items-center gap-3">
          <Input autoFocus aria-label="Nombre" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="h-9 min-w-56 flex-1" />
          <select aria-label="Categoría" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} className="h-9 rounded-lg border bg-white px-2 text-sm">
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="w-36"><AmountField compact valueCents={draft.price_cents} onChange={(c) => setDraft({ ...draft, price_cents: c })} /></div>
          <Button size="sm" disabled={!draft.name.trim()}>Guardar</Button><Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancelar</Button>
        </form>
      </li>
    );
  }
  return (
    <li className="flex items-center gap-4 px-5 py-2">
      <span className="min-w-0 flex-1 truncate text-sm">{t.name}{showCategory && <span className="ml-2 rounded-full bg-soft px-2 py-0.5 text-xs text-muted">{t.category}</span>}</span>
      <div className="w-36" onBlur={() => price !== t.price_cents && void run(() => updateTreatment(t.id, { name: t.name, category: t.category, price_cents: price }))}>
        <AmountField compact valueCents={price} onChange={setPrice} placeholder="Sin precio" />
      </div>
      {confirming ? (
        <span className="flex items-center gap-2 text-xs">¿Eliminar?
          <Button type="button" size="sm" variant="danger" onClick={() => void run(() => deleteTreatment(t.id))}>Sí</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}><X size={14} />No</Button>
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
