import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Banknote, CheckCircle2, FileText, Landmark, Palette, Phone, Settings as SettingsIcon, Upload, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ColorField } from "@/components/ui/color-field";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/shared/Field";
import { Dropdown } from "@/components/ui/dropdown";
import { TIME_ZONES } from "@/lib/time-zone";
import { lighten } from "@/lib/color";
import { MP_FEE_REFERENCE } from "@/config/wallet-fees";
import { PageHeader } from "@/components/shared/PageHeader";
import { BackLink } from "@/components/shared/BackLink";
import { Loading } from "@/components/feedback/ErrorMessage";
import { useSettings } from "@/app/providers";
import { setToken } from "@/lib/api";
import type { Settings } from "@/types";
import { ServicesManager } from "../components/ServicesManager";
import { mpConnectUrl, mpDisconnect, removeLogo, saveSettings, uploadLogo, type ProfileInput } from "../services/settings.service";

const MAX_LOGO = 200 * 1024;

const profileOf = (s: Settings): ProfileInput => {
  const { payments_online: _o, mp_connected: _c, mp_mock: _m, logo_url: _l, ...profile } = s;
  return profile;
};

export function SettingsPage() {
  const { settings, reload } = useSettings();
  const [params, setParams] = useSearchParams();
  const [form, setForm] = useState<ProfileInput | null>(null);
  const [logoBusy, setLogoBusy] = useState(false); // subiendo o quitando el logo
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

  // El logo es un archivo: se sube y se quita al instante, aparte de "Guardar cambios".
  const onLogo = async (file?: File) => {
    if (!file) return;
    if (file.size > MAX_LOGO) return setMsg({ ok: false, text: "El logo es muy pesado. Usá una imagen de menos de 200 KB." });
    setLogoBusy(true);
    try { await uploadLogo(file); await reload(); setMsg({ ok: true, text: "Logo actualizado." }); }
    catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : "No pudimos subir el logo." }); }
    finally { setLogoBusy(false); }
  };
  const dropLogo = async () => {
    setLogoBusy(true);
    try { await removeLogo(); await reload(); setMsg({ ok: true, text: "Logo quitado." }); }
    catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : "No pudimos quitar el logo." }); }
    finally { setLogoBusy(false); }
  };

  const discard = () => setForm(profileOf(settings));

  const save = async () => {
    setBusy(true);
    try {
      await saveSettings(form);
      await reload();
      setMsg({ ok: true, text: "Cambios guardados." }); // se queda en Configuración para ver lo guardado
      window.scrollTo(0, 0);
    } catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : "No pudimos guardar." }); } finally { setBusy(false); }
  };

  const connect = async () => { try { window.location.href = (await mpConnectUrl()).url; } catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : "No pudimos iniciar la conexión." }); } };
  const disconnect = async () => { await mpDisconnect(); await reload(); setMsg({ ok: true, text: "Mercado Pago desconectado." }); };

  // Qué grupo se abre solo: el de la dirección (?seccion=…), o Mercado Pago al volver de conectarlo.
  const openGroup = params.get("mp") ? "mercadopago" : params.get("seccion") ?? "";
  const mpWord = !settings.payments_online ? "Sin conexión" : settings.mp_mock ? "Modo piloto" : settings.mp_connected ? "Conectado" : "Sin conectar";

  return (
    <div className={`mx-auto max-w-2xl lg:max-w-5xl ${dirty ? "pb-24" : ""}`}>
      <BackLink to="/">inicio</BackLink>
      <PageHeader title="Configuración" icon={SettingsIcon} />
      {msg && <p role="status" className={`mb-4 rounded-lg px-4 py-3 text-sm ${msg.ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>{msg.text}</p>}

      {/* Lo único que hace falta para empezar: cómo se llama tu negocio y su logo */}
      <section className="space-y-5 rounded-3xl border bg-white p-5 sm:p-6">
        <Field label="Nombre de tu negocio"><Input value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <div className="flex flex-wrap items-center gap-4">
                <div className="h-16 w-16 rounded-lg border grid place-items-center bg-soft overflow-hidden">{settings.logo_url ? <img src={settings.logo_url} alt="Logo" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-muted">Sin logo</span>}</div>
                <div className="space-y-2 min-w-0 max-w-full">
                  <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { void onLogo(e.target.files?.[0]); e.target.value = ""; }} />
                  <Button type="button" variant="secondary" size="sm" disabled={logoBusy} onClick={() => fileRef.current?.click()}><Upload size={14} />{settings.logo_url ? "Cambiar logo" : "Subir logo"}</Button>
                  <p className="text-xs text-muted">PNG, JPG, SVG o WebP · hasta 200 KB</p>
                  {settings.logo_url && <Button type="button" size="sm" variant="ghost" disabled={logoBusy} onClick={() => void dropLogo()}>Quitar logo</Button>}
                </div>
        </div>
      </section>

      <p className="mt-4 px-1 text-center text-xs text-muted lg:hidden">Para más opciones de configuración, usalo desde la computadora.</p>

      <div className="mt-4 space-y-3">
        <Group className="hidden lg:block" icon={Landmark} title="Mercado Pago" hint={mpWord} open={openGroup === "mercadopago"}>
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
                  <p className="text-sm text-muted">Conectá tu cuenta para que tus destinatarios puedan pagar con un link. Vas a autorizar la app desde Mercado Pago; nosotros nunca vemos tu contraseña.</p>
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
          </div>
        </Group>

        <Group icon={Phone} title="Datos de contacto" hint="Salen en tus presupuestos y en la página de pago" open={openGroup === "contacto"}>
          <div className="space-y-4">
            <Field label="Nombre o profesión" hint="Ej: Ana Pérez · Diseño de interiores · Mat. 1234"><Input value={form.professional_info} onChange={(e) => set("professional_info", e.target.value)} /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Teléfono"><Input value={form.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
              <Field label="Email"><Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></Field>
            </div>
            <Field label="Dirección"><Input value={form.address} onChange={(e) => set("address", e.target.value)} /></Field>
          </div>
        </Group>

        <Group className="hidden lg:block" icon={Banknote} title="Datos para transferencia" hint={form.bank_cbu || form.bank_alias ? "Cargados" : "Sin cargar"} open={openGroup === "transferencia"}>
          <div className="space-y-4">
            <p className="text-sm text-muted">Van en el mensaje de WhatsApp cuando elegís cobrar por transferencia.</p>
            <Field label="Titular de la cuenta"><Input value={form.bank_holder} onChange={(e) => set("bank_holder", e.target.value)} /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="CBU o CVU" hint="22 números"><Input inputMode="numeric" value={form.bank_cbu} onChange={(e) => set("bank_cbu", e.target.value)} /></Field>
              <Field label="Alias"><Input value={form.bank_alias} onChange={(e) => set("bank_alias", e.target.value)} /></Field>
            </div>
          </div>
        </Group>

        <Group className="hidden lg:block" icon={FileText} title="Presupuestos" hint="Condiciones y servicios" open={openGroup === "presupuestos"}>
          <div className="space-y-5">
            <Field label="Condiciones de tus presupuestos" hint="Es el texto que sale en cada presupuesto nuevo. Podés cambiarlo en cada uno."><Textarea className="min-h-28" placeholder="Ej.: Los valores pueden variar según lo que se acuerde. Se abona un anticipo para reservar. No incluye lo que no esté detallado." value={form.terms} onChange={(e) => set("terms", e.target.value)} /></Field>
            <ServicesManager />
          </div>
        </Group>

        <Group icon={Palette} title="Apariencia y avanzado" hint={<><span className="lg:hidden">Color</span><span className="hidden lg:inline">Color y zona horaria</span></>} open={openGroup === "avanzado"}>
          <div className="space-y-5">
            <Field plain label="Color" hint="Títulos y líneas de tus presupuestos."><ColorField label="Color" value={form.primary_color} onChange={(v) => { set("primary_color", v); setForm((f) => (f ? { ...f, primary_color: v, accent_color: lighten(v, 0.45) } : f)); }} /></Field>
            <Field plain label="Zona horaria" className="hidden lg:block" hint="Define qué día es «hoy» y el cierre de cada día en los reportes.">
              <Dropdown searchable={false} ariaLabel="Zona horaria" placeholder="Elegí tu zona horaria" value={form.time_zone} onChange={(v) => set("time_zone", v)} options={TIME_ZONES.some((z) => z.value === form.time_zone) ? TIME_ZONES : [...TIME_ZONES, { value: form.time_zone, label: form.time_zone }]} />
            </Field>
          </div>
        </Group>
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
    </div>
  );
}

/** Un grupo plegado: título, una línea que dice cómo está, y su contenido al abrirlo. */
function Group({ icon: Icon, title, hint, open, children, className }: { icon: LucideIcon; title: string; hint: React.ReactNode; open: boolean; children: React.ReactNode; className?: string }) {
  return (
    <details open={open} className={`group rounded-3xl border bg-white px-5 py-4 sm:px-6 ${className ?? ""}`}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
        <span className="flex items-center gap-3.5"><span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><Icon size={19} /></span><span><span className="block font-semibold">{title}</span><span className="block text-sm text-muted">{hint}</span></span></span>
        <span aria-hidden className="text-muted transition group-open:rotate-90">›</span>
      </summary>
      <div className="pt-4">{children}</div>
    </details>
  );
}
