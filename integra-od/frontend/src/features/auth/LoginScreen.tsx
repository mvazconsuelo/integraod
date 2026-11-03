import { useEffect, useId, useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeOff, FileText, Info, Loader2, Lock, ShieldCheck, TriangleAlert, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

interface Brand { name: string; logo_data_url: string | null }

const POINTS = [
  { icon: FileText, title: "Presupuestos claros", text: "Creá y enviá presupuestos en pocos pasos." },
  { icon: Wallet, title: "Cobros al día", text: "Anticipos y pagos, siempre a la vista." },
  { icon: ShieldCheck, title: "Solo para vos", text: "Tu información y tus cobros están protegidos." },
];

/** Pantalla de ingreso. Muestra el nombre y el logo del negocio para que se reconozca que es el lugar correcto. */
export function LoginScreen({ onSubmit }: { onSubmit: (key: string) => Promise<string | null> }) {
  const [brand, setBrand] = useState<Brand | null>(null);
  const [value, setValue] = useState("");
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inputId = useId();

  useEffect(() => {
    let alive = true;
    api<Brand>("/public/brand", { auth: false }).then((b) => alive && setBrand(b)).catch(() => alive && setBrand({ name: "", logo_data_url: null }));
    return () => { alive = false; };
  }, []);
  useEffect(() => { document.title = brand?.name ? `Ingresar · ${brand.name}` : "Ingresar"; }, [brand?.name]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !value.trim()) return;
    setBusy(true);
    setError("");
    const problem = await onSubmit(value.trim());
    if (problem) { setError(problem); setValue(""); }
    setBusy(false);
  };

  return (
    <main className="min-h-dvh flex items-center justify-center bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] lg:p-6">
      {/* Una sola composición centrada y con ancho máximo: el panel y el formulario quedan cerca, también en pantallas muy anchas */}
      <div className="w-full grid lg:max-w-6xl lg:grid-cols-[1.05fr_1fr] lg:gap-12 xl:gap-16">
      {/* Panel de marca: una tarjeta (no una mitad pegada al borde). Solo en pantallas grandes */}
      <aside className="relative hidden lg:flex flex-col overflow-hidden lg:min-h-[640px] rounded-[2rem] bg-primary text-white p-10 xl:p-12 shadow-[0_24px_48px_-24px_rgba(23,59,54,0.45)]">
        <div aria-hidden className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full border border-white/10" />
        <div aria-hidden className="pointer-events-none absolute -right-12 -top-12 h-96 w-96 rounded-full border border-white/10" />
        <div aria-hidden className="pointer-events-none absolute -bottom-40 -left-24 h-[28rem] w-[28rem] rounded-full bg-secondary/25 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute bottom-24 right-16 h-24 w-24 rounded-full bg-accent/20 blur-2xl" />

        <div className="relative flex items-center gap-2 text-sm text-white/70"><Lock size={16} />Acceso privado</div>

        <div className="relative my-auto max-w-md space-y-10 pb-24">
          <h2 className="text-3xl xl:text-4xl font-semibold leading-tight tracking-tight">Tus presupuestos y cobros, en un solo lugar.</h2>
          <ul className="space-y-5">
            {POINTS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex items-start gap-4">
                <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 text-accent"><Icon size={20} /></span>
                <span><span className="block font-medium">{title}</span><span className="block text-sm text-white/70">{text}</span></span>
              </li>
            ))}
          </ul>
        </div>

      </aside>

      <section className="flex items-center justify-center px-4 py-5 sm:px-8 sm:py-10 lg:px-0 lg:py-0">
        <div className="login-rise w-full max-w-md">
          {/* Identidad del negocio */}
          <div className="mb-4 min-h-12 flex items-center sm:mb-7 sm:min-h-14">
            <div className={`transition-opacity duration-300 ${brand ? "opacity-100" : "opacity-0"}`}>
              {brand?.logo_data_url ? (
                <img src={brand.logo_data_url} alt={brand.name || "Logo"} className="h-11 w-auto max-w-64 object-contain sm:h-14" />
              ) : (
                <div className="flex items-center gap-2.5 text-primary font-semibold text-lg">
                  <img src="/logo.svg" alt="" className="h-9 w-9" />
                  <span className="truncate">{brand?.name || "Mi negocio"}</span>
                </div>
              )}
            </div>
          </div>

          <form onSubmit={submit} className="rounded-2xl border bg-white p-5 sm:p-9 shadow-[0_1px_2px_rgba(23,59,54,0.04),0_16px_40px_-16px_rgba(23,59,54,0.14)] space-y-4 sm:space-y-6">
            <div className="space-y-1.5">
              <h1 className="text-2xl font-semibold tracking-tight">Ingresá a tus cobros</h1>
            </div>

            {/* Ayuda a los gestores de contraseñas a guardar la clave */}
            <input type="text" name="usuario" autoComplete="username" defaultValue={brand?.name || "admin"} tabIndex={-1} aria-hidden className="sr-only" readOnly />

            <div className="space-y-2.5">
              <label htmlFor={inputId} className="block text-sm font-medium">Clave de acceso</label>
              <div className="relative">
                <input
                  id={inputId} name="clave" type={visible ? "text" : "password"} autoComplete="current-password" autoFocus spellCheck={false}
                  value={value} onChange={(e) => { setValue(e.target.value); if (error) setError(""); }}
                  onKeyUp={(e) => setCapsLock(e.getModifierState("CapsLock"))} onBlur={() => setCapsLock(false)}
                  aria-invalid={Boolean(error)} aria-describedby={error ? `${inputId}-error` : undefined}
                  className={`h-11 w-full rounded-lg border bg-white pl-3.5 pr-11 text-sm placeholder:text-muted/70 transition-colors ${error ? "border-danger/60" : "focus:border-secondary"}`}
                  placeholder="Tu clave"
                />
                <button
                  type="button" onClick={() => setVisible((v) => !v)} aria-label={visible ? "Ocultar clave" : "Mostrar clave"} aria-pressed={visible}
                  className="absolute right-1.5 top-1.5 grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-soft hover:text-foreground cursor-pointer"
                >
                  {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {capsLock && !error && <p className="flex items-center gap-1.5 text-xs text-warning"><TriangleAlert size={14} />Tenés las mayúsculas activadas.</p>}
              {error && <p id={`${inputId}-error`} role="alert" className="flex items-start gap-1.5 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger"><TriangleAlert size={16} className="mt-0.5 shrink-0" />{error}</p>}
            </div>

            <Button className="w-full h-11" disabled={busy || !value.trim()}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
              {busy ? "Entrando…" : "Entrar"}
            </Button>
          </form>

          {/* Anti-estafas: la estafa típica es que alguien pida la clave */}
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-soft px-3.5 py-2.5 text-xs text-muted sm:mt-5 sm:py-3">
            <Info size={14} className="mt-0.5 shrink-0 text-secondary" />
            <span>Nadie te va a pedir tu clave por mensaje, mail o teléfono. No se la pases a nadie.</span>
          </p>
          <p className="mt-3 text-center text-sm text-muted sm:mt-5"><span className="block font-medium text-foreground">¿Te olvidaste la clave?</span>Pedísela a quien te dio acceso al sistema.</p>
        </div>
      </section>
      </div>
    </main>
  );
}
