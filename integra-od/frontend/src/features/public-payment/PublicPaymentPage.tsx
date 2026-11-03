import { useParams, useSearchParams } from "react-router-dom";
import { ArrowUpRight, CalendarClock, CheckCircle2, CircleAlert, Info, Mail, MapPin, Phone } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/currency";
import { formatDate } from "@/lib/formatters";

interface View {
  clinic: { name: string; logo_data_url: string | null; primary_color: string; phone: string; email: string; address: string; professional_info: string };
  patient_ref: string; concept: string; amount_cents: number; conditions: string; budget_number: number | null; pay_in_cash: boolean; due_date: string | null; created_at: string; status: string; checkout_url: string | null;
}

/** Página pública: sin sesión. Tiene que dejar claro quién cobra, qué se paga, hasta cuándo y cómo se hace. */
export function PublicPaymentPage() {
  const { publicId = "" } = useParams();
  const result = useSearchParams()[0].get("resultado");
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<View>(`/public/payments/${encodeURIComponent(publicId)}`, { auth: false }).then(setView).catch((e) => setError(e instanceof Error ? e.message : "No pudimos cargar el pago."));
  }, [publicId]);

  useEffect(() => { if (view) document.title = `Pagar · ${view.clinic.name || "Negocio"}`; }, [view]);

  if (error) return <Page><p className="text-center text-muted py-10">{error}</p></Page>;
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

  return (
    <Page>
      <article className="bg-white border rounded-2xl shadow-[0_1px_2px_rgba(23,59,54,0.04),0_16px_40px_-20px_rgba(23,59,54,0.14)]">
        <header className="px-6 sm:px-8 py-5 border-b">
          {clinic.logo_data_url ? (
            // El logo suele traer el nombre escrito: se muestra solo, más grande y sin repetirlo.
            <img src={clinic.logo_data_url} alt={clinic.name || "Negocio"} className="h-14 w-auto max-w-[240px] object-contain" />
          ) : (
            <p className="text-lg font-semibold" style={{ color }}>{clinic.name || "Negocio"}</p>
          )}
        </header>

        <div className="px-6 sm:px-8 py-6 space-y-6">
          <div>
            <p className="text-sm text-muted">{name === "el negocio" ? "Tenés un pedido de pago" : <>Pedido de pago de <strong className="font-medium text-foreground">{name}</strong></>}</p>
            <p className="text-4xl font-semibold tabular mt-1" style={{ color }}>{formatMoney(view.amount_cents)}</p>
          </div>

          <dl className="divide-y border-y text-sm">
            <Row label="Concepto" value={view.concept} />
            {view.budget_number != null && <Row label="Presupuesto" value={`N° ${String(view.budget_number).padStart(4, "0")}`} />}
            <Row label="A nombre de" value={view.patient_ref} />
            {view.due_date && <Row label="Vence" value={formatDate(view.due_date)} tone={view.status === "expired" ? "danger" : undefined} />}
            <Row label="Fecha del pedido" value={formatDate(view.created_at)} />
          </dl>

          {view.conditions && (
            <div className="rounded-lg bg-soft px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted mb-1">Condiciones</p>
              <p className="text-sm whitespace-pre-line">{view.conditions}</p>
            </div>
          )}

          {result === "rejected" && <p role="alert" className="flex gap-2 text-sm text-danger bg-danger/10 rounded-lg px-4 py-3"><CircleAlert size={18} className="shrink-0 mt-0.5" />El pago fue rechazado. Podés intentar de nuevo.</p>}
          {result === "pending" && <p role="status" className="flex gap-2 text-sm text-[#7a5222] bg-warning/10 rounded-lg px-4 py-3"><CalendarClock size={18} className="shrink-0 mt-0.5" />Tu pago quedó pendiente de acreditación. Cuando se confirme, {name} lo va a ver.</p>}

          {view.status === "paid" ? (
            <div role="status" className="flex items-start gap-3 rounded-xl bg-success/10 px-4 py-4 text-success">
              <CheckCircle2 size={22} strokeWidth={2.25} className="shrink-0" />
              <div><p className="font-semibold">Pago recibido</p><p className="text-sm">Gracias. {clinic.name ? `${clinic.name} ya recibió` : "Ya recibimos"} este pago.</p></div>
            </div>
          ) : payable && view.pay_in_cash ? (
            <p className="rounded-xl bg-soft px-4 py-4 text-sm">Este pedido se paga <strong>en efectivo</strong> en {name}.</p>
          ) : payable && view.checkout_url ? (
            <div className="space-y-3">
              <a href={view.checkout_url} className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 font-medium text-white hover:opacity-95" style={{ background: color }}>
                Pagar con Mercado Pago<ArrowUpRight size={18} strokeWidth={2.25} />
              </a>
              <p className="flex items-start gap-2 text-xs text-muted"><Info size={14} className="mt-0.5 shrink-0" />Vas a completar el pago en el sitio de Mercado Pago. Nosotros no vemos los datos de tu tarjeta.</p>
            </div>
          ) : (
            <p className="rounded-xl bg-soft px-4 py-4 text-sm">
              {view.status === "expired" ? `Este pedido de pago venció${view.due_date ? ` el ${formatDate(view.due_date)}` : ""}. Pedile uno nuevo a ${name}.`
                : view.status === "cancelled" ? `Este pedido de pago fue cancelado. Si tenés dudas, comunicate con ${name}.`
                : `El pago online no está disponible por ahora. Consultá con ${name}.`}
            </p>
          )}
        </div>
      </article>

      {(contact.length > 0 || clinic.professional_info) && (
        <section aria-label="Contacto" className="px-2 text-sm">
          <h2 className="font-semibold mb-3">Contacto</h2>
          <ul className="space-y-2">
            {contact.map(({ icon: Icon, text, href }) => (
              <li key={text} className="flex items-start gap-2.5">
                <Icon size={16} className="mt-0.5 shrink-0 text-secondary" />
                {href ? <a href={href} className="underline underline-offset-2 break-all">{text}</a> : <span>{text}</span>}
              </li>
            ))}
          </ul>
          {clinic.professional_info && <p className="mt-3 text-xs text-muted">{clinic.professional_info}</p>}
        </section>
      )}
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

const Page = ({ children }: { children: ReactNode }) => (
  <main className="min-h-dvh px-4 py-8 sm:py-14"><div className="mx-auto max-w-md space-y-4">{children}</div></main>
);
