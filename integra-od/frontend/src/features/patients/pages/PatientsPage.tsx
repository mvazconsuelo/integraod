import { useState } from "react";
import { Link } from "react-router-dom";
import { Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import { WhatsAppIcon } from "@/components/ui/whatsapp-icon";
import { Avatar } from "@/components/shared/Avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorMessage, Loading } from "@/components/feedback/ErrorMessage";
import { useApi } from "@/hooks/useApi";
import { api } from "@/lib/api";
import { patientPath } from "@/lib/patients";
import { whatsappUrl } from "@/lib/phone";
import { ContactDialog } from "../components/ContactDialog";
import type { Contact } from "@/types";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** La agenda: los clientes con su teléfono. Se agregan, se editan y se borran acá. */
export function PatientsPage() {
  const { data, error, loading, reload } = useApi<Contact[]>("/patients/contacts");
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<{ contact?: Contact } | null>(null);
  const [removing, setRemoving] = useState<Contact | null>(null);
  const [removeError, setRemoveError] = useState("");

  const q = norm(query.trim());
  const rows = (data ?? [])
    .filter((c) => norm(c.name).includes(q) || (c.phone ?? "").includes(q.replace(/\D/g, "") || "\u0000"))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  const remove = async () => {
    if (!removing) return;
    try { await api(`/patients/${removing.id}`, { method: "DELETE" }); setRemoving(null); await reload(); }
    catch (e) { setRemoveError(e instanceof Error ? e.message : "No pudimos borrar al destinatario."); }
  };

  const Actions = ({ c }: { c: Contact }) => (
    <div className="flex shrink-0 items-center">
      {c.phone && <Button type="button" size="icon" variant="ghost" className="h-9 w-9 sm:h-10 sm:w-10" asChild><a href={whatsappUrl(c.phone, "")} target="_blank" rel="noreferrer" aria-label={`Escribirle a ${c.name} por WhatsApp`}><WhatsAppIcon size={17} /></a></Button>}
      <Button type="button" size="icon" variant="ghost" className="h-9 w-9 sm:h-10 sm:w-10" aria-label={`Editar a ${c.name}`} onClick={() => setDialog({ contact: c })}><Pencil size={16} /></Button>
      <Button type="button" size="icon" variant="ghost" className="h-9 w-9 sm:h-10 sm:w-10" aria-label={`Borrar a ${c.name}`} onClick={() => { setRemoveError(""); setRemoving(c); }}><Trash2 size={16} /></Button>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader title="Destinatarios" icon={Users} action={<Button onClick={() => setDialog({})}><Plus size={16} />Nuevo destinatario</Button>} />
      {error && <ErrorMessage message={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {data?.length === 0 && <EmptyState message="Todavía no cargaste destinatarios. Agregá el primero con «Nuevo destinatario»." />}
      {data && data.length > 0 && (
        <div className="space-y-4">
          <div className="relative max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <Input aria-label="Buscar destinatario" placeholder="Buscar por nombre o teléfono" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
          </div>
          {rows.length === 0 ? <p className="text-sm text-muted">No encontramos destinatarios con eso.</p> : (
            <Card className="overflow-hidden rounded-3xl">
              <ul className="divide-y">
                {rows.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 px-4 py-3.5 sm:gap-3.5 sm:px-5">
                    <Avatar name={c.name} />
                    <div className="min-w-0 flex-1">
                      <Link to={patientPath(c.name)} className={`block font-semibold leading-tight [overflow-wrap:anywhere] hover:underline ${c.name.length > 28 ? "text-[15px]" : "text-[17px]"}`}>{c.name}</Link>
                      <p className={c.phone ? "whitespace-nowrap text-sm text-muted tabular" : "text-sm text-muted"}>{c.phone_display ?? "Sin teléfono"}</p>
                    </div>
                    <Actions c={c} />
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
      {dialog && <ContactDialog open onOpenChange={(o) => !o && setDialog(null)} contact={dialog.contact} onSaved={() => void reload()} />}
      {removing && (
        <Dialog open onOpenChange={(o) => !o && setRemoving(null)} title={`¿Borrar a ${removing.name}?`} description="Se saca de los destinatarios. Si ya tiene presupuestos o cobros, se conserva para no perder el historial.">
          {removeError && <p role="alert" className="mb-3 text-sm text-danger">{removeError}</p>}
          <div className="flex gap-3">
            <Button variant="ghost" className="flex-1" onClick={() => setRemoving(null)}>No, volver</Button>
            <Button variant="danger" className="flex-1" onClick={() => void remove()}>Sí, borrar</Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
