import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ColorField } from "@/components/ui/color-field";
import { NumberField } from "@/components/ui/number-field";
import { TabPanel, Tabs } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/shared/Field";
import { Dropdown } from "@/components/ui/dropdown";
import { TIME_ZONES } from "@/lib/time-zone";
import { MP_FEE_REFERENCE } from "@/config/wallet-fees";
import { PageHeader } from "@/components/shared/PageHeader";
import { BackLink } from "@/components/shared/BackLink";
import { Loading } from "@/components/feedback/ErrorMessage";
import { useSettings } from "@/app/providers";
import { setToken } from "@/lib/api";
import type { Settings } from "@/types";
import { TreatmentCatalogCard } from "../components/TreatmentCatalogCard";
import { mpConnectUrl, mpDisconnect, saveSettings, type ProfileInput } from "../services/settings.service";

const MAX_LOGO = 200 * 1024;

const profileOf = (s: Settings): ProfileInput => {
  const { payments_online: _o, mp_connected: _c, mp_mock: _m, ...profile } = s;
  return profile;
};

export function SettingsPage() {
  const { settings, reload } = useSettings();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [form, setForm] = useState<ProfileInput | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (settings && !form) setForm(profileOf(settings));
  }, [settings, form]);

  // Un único "Guardar cambios" para todas las pestañas: avisa si hay algo sin guardar.
  const dirty = Boolean(form && settings && JSON.stringify(form) !== JSON.stringify(profileOf(settings)));
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    const mp = params.get("mp");
    if (mp === "ok") setMsg({ ok: true, text: "¡Listo! Tu cuenta de Mercado Pago quedó conectada." });
    if (mp === "error") setMsg({ ok: false, text: "No pudimos conectar Mercado Pago. Probá de nuevo." });
  }, [params]);

  if (!settings || !form) return <Loading />;
  const set = <K extends keyof ProfileInput>(k: K, v: ProfileInput[K]) => setForm({ ...form, [k]: v });

  const onLogo = (file?: File) => {
    if (!file) return;
    if (file.size > MAX_LOGO) return setMsg({ ok: false, text: "El logo es muy pesado. Usá una imagen de menos de 200 KB." });
    const reader = new FileReader();
    reader.onload = () => set("logo_data_url", String(reader.result));
    reader.readAsDataURL(file);
  };

  const discard = () => setForm(profileOf(settings));

  const save = async () => {
    setBusy(true);
    try {
      await saveSettings(form);
      await reload();
      navigate("/", { state: { notice: "Cambios guardados." } }); // al guardar se vuelve al inicio
    } catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : "No pudimos guardar." }); } finally { setBusy(false); }
  };

  const connect = async () => { try { window.location.href = (await mpConnectUrl()).url; } catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : "No pudimos iniciar la conexión." }); } };
  const disconnect = async () => { await mpDisconnect(); await reload(); setMsg({ ok: true, text: "Mercado Pago desconectado." }); };

  const section = params.get("mp") ? "mercadopago" : (SECTIONS.find((t) => t.id === params.get("seccion"))?.id ?? "consultorio");
  const goTo = (id: string) => setParams(id === "consultorio" ? {} : { seccion: id }, { replace: true });

  return (
    <>
      <BackLink to="/">inicio</BackLink>
      <PageHeader title="Configuración" subtitle="Se configura una sola vez y se usa en todos tus presupuestos y links de pago." />
      {msg && <p role="status" className={`mb-4 rounded-lg px-4 py-3 text-sm ${msg.ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>{msg.text}</p>}

      <Tabs tabs={SECTIONS} value={section} onChange={goTo} label="Secciones de configuración" idPrefix="settings" />

      <div className={`max-w-3xl ${dirty ? "pb-24" : ""}`}>
        <TabPanel id="consultorio" value={section} idPrefix="settings">
          <div className="space-y-4">
            <Card className="p-5 space-y-4">
              <div>
                <h2 className="text-base font-semibold">Datos de tu negocio</h2>
                <p className="text-sm text-muted mt-0.5">Se muestran en tus presupuestos y en la página de pago, para que tus contactos sepan cómo comunicarse con vos.</p>
              </div>
              <Field label="Nombre comercial"><Input value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
              <Field label="Información profesional" hint="Ej: Ana Pérez · Diseño de interiores · Mat. 1234"><Input value={form.professional_info} onChange={(e) => set("professional_info", e.target.value)} /></Field>
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Teléfono"><Input value={form.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
                <Field label="Email"><Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></Field>
              </div>
              <Field label="Dirección"><Input value={form.address} onChange={(e) => set("address", e.target.value)} /></Field>
              <Field plain label="Zona horaria" hint="Define qué día es «hoy», el cierre de cada día en los reportes y los vencimientos.">
                <Dropdown searchable={false} ariaLabel="Zona horaria" placeholder="Elegí tu zona horaria" value={form.time_zone} onChange={(v) => set("time_zone", v)} options={TIME_ZONES.some((z) => z.value === form.time_zone) ? TIME_ZONES : [...TIME_ZONES, { value: form.time_zone, label: form.time_zone }]} />
              </Field>
            </Card>

            <Card className="p-5 space-y-4">
              <h2 className="text-base font-semibold">Identidad visual</h2>
              <div className="flex flex-wrap items-center gap-4">
                <div className="h-16 w-16 rounded-lg border grid place-items-center bg-soft overflow-hidden">{form.logo_data_url ? <img src={form.logo_data_url} alt="Logo" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-muted">Sin logo</span>}</div>
                <div className="space-y-2 min-w-0 max-w-full">
                  <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { onLogo(e.target.files?.[0]); e.target.value = ""; }} />
                  <Button type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()}><Upload size={14} />{form.logo_data_url ? "Cambiar logo" : "Subir logo"}</Button>
                  <p className="text-xs text-muted">PNG, JPG, SVG o WebP · hasta 200 KB</p>
                  {form.logo_data_url && <Button type="button" size="sm" variant="ghost" onClick={() => set("logo_data_url", null)}>Quitar logo</Button>}
                </div>
              </div>
              <div className="space-y-5">
                <Field plain label="Color principal" hint="Títulos y encabezados de tus presupuestos."><ColorField label="Color principal" value={form.primary_color} onChange={(v) => set("primary_color", v)} /></Field>
                <Field plain label="Color de acento" hint="Detalles y líneas de color."><ColorField label="Color de acento" value={form.accent_color} onChange={(v) => set("accent_color", v)} /></Field>
              </div>
            </Card>
          </div>
        </TabPanel>

        <TabPanel id="presupuestos" value={section} idPrefix="settings">
          <div className="space-y-4">
              <Card className="p-5 space-y-4">
                <h2 className="text-base font-semibold">Condiciones de los presupuestos</h2>
                <Field label="Condiciones comerciales" hint="Aparecen en cada presupuesto nuevo."><Textarea value={form.terms} onChange={(e) => set("terms", e.target.value)} /></Field>
                <Field plain label="Vigencia por defecto (días)"><NumberField ariaLabel="Vigencia por defecto en días" min={1} max={365} value={form.default_validity_days} onChange={(n) => set("default_validity_days", n)} className="max-w-44" /></Field>
              </Card>
            <TreatmentCatalogCard />
          </div>
        </TabPanel>

        <TabPanel id="mercadopago" value={section} idPrefix="settings">
          <div className="space-y-4">
            <Card className="p-5 space-y-3">
              <h2 className="text-base font-semibold">Mercado Pago</h2>
              {!settings.payments_online ? (
                <p role="alert" className="text-sm text-danger">El servicio de pagos no responde en este momento. Mientras tanto no se pueden conectar cuentas ni crear cobros.</p>
              ) : settings.mp_mock ? (
                <p className="text-sm text-muted">Estás en <strong>modo piloto</strong>: los links de pago llevan a una pantalla que simula Mercado Pago. No hace falta conectar ninguna cuenta y no se cobra dinero real. Para cobrar de verdad, se desactiva el modo simulado y se conecta tu cuenta.</p>
              ) : settings.mp_connected ? (
                <>
                  <p className="flex items-center gap-2 text-sm text-success">Cuenta conectada<CheckCircle2 size={18} strokeWidth={2.25} /></p>
                  <Button variant="secondary" size="sm" onClick={disconnect}>Desconectar</Button>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted">Conectá tu cuenta para que los contactos puedan pagar con un link. Vas a autorizar la app desde Mercado Pago; nosotros nunca vemos tu contraseña.</p>
                  <Button onClick={connect}>Conectar Mercado Pago</Button>
                </>
              )}
            </Card>
            {/* Al conectar la cuenta (o en el piloto): lo que cuesta cobrar online, para tenerlo en cuenta al armar los cobros */}
            {(settings.mp_connected || settings.mp_mock) && (
              <Card className="p-5 space-y-4">
                <div>
                  <h2 className="text-base font-semibold">Comisiones de Mercado Pago</h2>
                  <p className="text-sm text-muted mt-1">Mercado Pago descuenta una comisión de cada cobro online. Tené en cuenta este costo al armar tus cobros y presupuestos.</p>
                </div>
                <div>
                  <p className="text-sm font-medium mb-2">Según cuándo recibís el dinero <span className="font-normal text-muted">(porcentaje sobre cada cobro)</span></p>
                  <dl className="divide-y rounded-lg border text-sm">
                    {MP_FEE_REFERENCE.terms.map((t) => (
                      <div key={t.label} className="flex items-baseline justify-between gap-4 px-4 py-2.5">
                        <dt className="text-muted">{t.label}</dt>
                        <dd className="tabular font-medium">{t.percent}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <p className="text-sm text-muted">Si ofrecés cuotas sin interés, se suma un costo adicional que depende de la cantidad de cuotas. Los pagos en efectivo no tienen comisión.</p>
                <p className="text-xs text-muted">
                  Valores de referencia publicados por Mercado Pago ({MP_FEE_REFERENCE.asOf}). No incluyen impuestos ni retenciones y pueden variar según tu provincia, el medio de pago y el plazo que elijas.{" "}
                  <a href={MP_FEE_REFERENCE.source} target="_blank" rel="noreferrer" className="text-secondary font-medium underline underline-offset-2">Ver tarifas vigentes</a>
                </p>
              </Card>
            )}
            <Button variant="ghost" onClick={() => { setToken(""); window.location.href = "/"; }}>Cerrar sesión</Button>
          </div>
        </TabPanel>
      </div>

      {dirty && (
        <div role="region" aria-label="Cambios sin guardar" className="fixed inset-x-0 bottom-16 md:bottom-0 z-40 border-t bg-white">
          <div className="mx-auto max-w-6xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">Tenés cambios sin guardar.</p>
            <div className="flex gap-2">
              <Button variant="ghost" disabled={busy} onClick={discard}>Descartar</Button>
              <Button disabled={busy} onClick={() => void save()}>Guardar cambios</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const SECTIONS = [
  { id: "consultorio", label: "Negocio" },
  { id: "presupuestos", label: "Presupuestos y servicios" },
  { id: "mercadopago", label: "Mercado Pago" },
];
