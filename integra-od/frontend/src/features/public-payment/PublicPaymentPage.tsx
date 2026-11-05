import { useParams, useSearchParams } from "react-router-dom";
import { ArrowUpRight, CalendarClock, CheckCircle2, CircleAlert, Info, Mail, MapPin, Phone } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/currency";
import { formatDate } from "@/lib/formatters";
import { useFixedPage } from "@/hooks/useFixedPage";

interface View {
  clinic: { name: string; logo_url: string | null; primary_color: string; phone: string; email: string; address: string; professional_info: string };
  patient_ref: string; concept: string; amount_cents: number; conditions: string; budget_number: number | null; pay_in_cash: boolean; due_date: string | null; created_at: string; status: string; checkout_url: string | null;
}

/** Página pública: sin sesión. Tiene que dejar claro quién cobra, qué se paga, hasta cuándo y cómo se hace. */
export function PublicPaymentPage() {
  const { publicId = "" } = useParams();
  const result = useSearchParams()[0].get("resultado");
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState("");
  useFixedPage();

  useEffect(() => {
    api<View>(`/public/payments/${encodeURIComponent(publicId)}`, { auth: false }).then(setView).catch((e) => setError(e instanceof Error ? e.message : "No pudimos cargar el pago."));
  }, [publicId]);

  useEffect(() => { if (view) document.title = `Pagar · ${view.clinic.name || "Negocio"}`; }, [view]);

  if (error) return <Page><p className="py-10 text-center text-muted">{error}</p></Page>;
  if (!view) return <Page><p className="text-center text-muted py-10">Cargando…</p></Page>;

  const { clinic } = view;
  const name = clinic.name || "el negocio";
  const color = clinic.primary_color;
  const payable = view.status === "pending" || view.status === "partially_paid";
  const contact = [
    clinic.phone && { icon: Phone, text: clinic.phone, href: phoneHref(clinic.phone) },
    clinic.email && { icon: Mail, text: clinic.email, href: `mailto:${clinic.email}` },
    clinic.address && { icon: MapPin, text: clinic.address, href: undefined },
  ].filter(Boolean) as { icon: typeof Phone; text: string; href?: string }[];

  // La acción (pagar, o el estado del pedido) va abajo, siempre a la vista; lo demás scrollea arriba si no entra.
  const action = view.status === "paid" ? (
    <div role="status" className="flex items-start gap-3 rounded-xl bg-success/10 px-4 py-4 text-success">
      <CheckCircle2 size={22} strokeWidth={2.25} className="shrink-0" />
      <div><p className="font-semibold">Pago recibido</p><p className="text-sm">Gracias. {clinic.name ? `${clinic.name} ya recibió` : "Ya recibimos"} este pago.</p></div>
    </div>
  ) : payable && view.pay_in_cash ? (
    <p className="rounded-xl bg-soft px-4 py-4 text-sm">Este pago se hace <strong>en efectivo</strong> en {name}.</p>
  ) : payable && view.checkout_url ? (
    <div className="space-y-2.5">
      <a href={view.checkout_url} className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-base font-medium text-white hover:opacity-95" style={{ background: color }}>
        Pagar con Mercado Pago<ArrowUpRight size={18} strokeWidth={2.25} />
      </a>
      <p className="flex items-start gap-2 text-xs text-muted"><Info size={14} className="mt-0.5 shrink-0" />Vas a completar el pago en el sitio de Mercado Pago. Nosotros no vemos los datos de tu tarjeta.</p>
    </div>
  ) : (
    <p className="rounded-xl bg-soft px-4 py-4 text-sm">
      {view.status === "expired" ? `Este link de pago venció${view.due_date ? ` el ${formatDate(view.due_date)}` : ""}. Pedile uno nuevo a ${name}.`
        : view.status === "cancelled" ? `Este link de pago fue cancelado. Si tenés dudas, comunicate con ${name}.`
        : `El pago online no está disponible por ahora. Consultá con ${name}.`}
    </p>
  );

  return (
    <Page
      top={clinic.logo_url ? (
        // El logo suele traer el nombre escrito: se muestra solo, más grande y sin repetirlo.
        <img src={clinic.logo_url} alt={clinic.name || "Negocio"} className="h-12 [@media(max-height:620px)]:h-9 w-auto max-w-[220px] object-contain sm:h-14" />
      ) : (
        <p className="text-lg font-semibold" style={{ color }}>{clinic.name || "Negocio"}</p>
      )}
      bottom={action}
    >
      <div className="space-y-5 [@media(max-height:620px)]:space-y-3">
        <div>
          <p className="text-sm text-muted">{name === "el negocio" ? "Tenés un pago pendiente" : <>Pago a <strong className="font-medium text-foreground">{name}</strong></>}</p>
          <p className="mt-1 text-4xl [@media(max-height:620px)]:text-3xl font-semibold tabular" style={{ color }}>{formatMoney(view.amount_cents)}</p>
        </div>

        <dl className="divide-y border-y text-sm">
          <Row label="Concepto" value={view.concept} />
          {view.budget_number != null && <Row label="Presupuesto" value={`N° ${String(view.budget_number).padStart(4, "0")}`} />}
          {view.due_date && <Row label="Vence" value={formatDate(view.due_date)} tone={view.status === "expired" ? "danger" : undefined} />}
        </dl>

        {view.conditions && (
          <div className="rounded-lg bg-soft px-4 py-3">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Condiciones</p>
            <p className="whitespace-pre-line text-sm">{view.conditions}</p>
          </div>
        )}

        {result === "rejected" && <p role="alert" className="flex gap-2 rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger"><CircleAlert size={18} className="mt-0.5 shrink-0" />El pago fue rechazado. Podés intentar de nuevo.</p>}
        {result === "pending" && <p role="status" className="flex gap-2 rounded-lg bg-warning/10 px-4 py-3 text-sm text-[#7a5222]"><CalendarClock size={18} className="mt-0.5 shrink-0" />Tu pago quedó pendiente de acreditación. Cuando se confirme, {name} lo va a ver registrado.</p>}

        {(contact.length > 0 || clinic.professional_info) && (
          <section aria-label="Contacto" className="border-t pt-4 text-sm">
            <h2 className="mb-2 font-semibold">Contacto</h2>
            <ul className="space-y-2">
              {contact.map(({ icon: Icon, text, href }) => (
                <li key={text} className="flex items-start gap-2.5">
                  <Icon size={16} className="mt-0.5 shrink-0 text-secondary" />
                  {href ? <a href={href} className="break-all underline underline-offset-2">{text}</a> : <span>{text}</span>}
                </li>
              ))}
            </ul>
            {clinic.professional_info && <p className="mt-3 text-xs text-muted">{clinic.professional_info}</p>}
          </section>
        )}
      </div>
    </Page>
  );
}

/** Solo es link de llamada si parece un teléfono (+, números, espacios, guiones, paréntesis). Si no, se muestra como texto: un link roto es peor que ninguno. */
const phoneHref = (raw: string) => {
  const digits = raw.replace(/[\s().-]/g, "");
  return /^\+?\d{8,15}$/.test(digits) ? `tel:${digits}` : undefined;
};

const Row = ({ label, value, tone }: { label: string; value: string; tone?: "danger" }) => (
  <div className="flex items-baseline justify-between gap-4 py-3">
    <dt className="text-muted shrink-0">{label}</dt>
    <dd className={`text-right font-medium ${tone === "danger" ? "text-danger" : ""}`}>{value}</dd>
  </div>
);

/**
 * Ocupa la pantalla: arriba la marca, en el medio lo que se paga (scrollea si no entra) y abajo la acción, siempre a la vista
 * y por encima de la barra del teléfono (safe area). En pantallas grandes es una tarjeta centrada.
 */
function Page({ children, top, bottom }: { children: ReactNode; top?: ReactNode; bottom?: ReactNode }) {
  return (
    <main className="flex h-dvh items-stretch justify-center sm:items-center sm:px-4 sm:py-8">
      <div className="flex h-full w-full max-w-md flex-col bg-white sm:h-auto sm:max-h-full sm:rounded-2xl sm:border">
        {top && <header className="shrink-0 border-b px-5 pb-4 [@media(max-height:620px)]:pb-2 pt-[max(1rem,env(safe-area-inset-top))] [@media(max-height:620px)]:pt-2 sm:px-8 sm:pt-5">{top}</header>}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 [@media(max-height:620px)]:py-3 sm:px-8 sm:py-6">{children}</div>
        {bottom && <footer className="shrink-0 border-t px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:px-8 sm:pb-6">{bottom}</footer>}
      </div>
    </main>
  );
}
