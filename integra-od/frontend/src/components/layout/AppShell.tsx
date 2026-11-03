import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { NAV, isNavActive } from "@/app/navigation";
import { useSettings } from "@/app/providers";
import { cn } from "@/lib/utils";
import { MenuButton, MenuPanel } from "./HamburgerMenu";
import { PeriodReportSheet } from "./PeriodReportSheet";
import { ReportsDialog } from "./ReportsDialog";

function NavItem({ item, active }: { item: (typeof NAV)[number]; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link to={item.to} aria-current={active ? "page" : undefined} className={cn("flex flex-col items-center gap-0.5 pb-2 pt-2 text-[11px]", active ? "text-primary font-semibold" : "text-muted")}>
      <span className={cn("grid h-8 w-14 place-items-center rounded-full transition", active && "bg-primary/10")}><Icon size={22} strokeWidth={active ? 2.5 : 2} /></span>{item.label}
    </Link>
  );
}

export function AppShell() {
  const { settings } = useSettings();
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [printRange, setPrintRange] = useState<{ from: string; to: string } | null>(null);
  const location = useLocation();
  const [notice, setNotice] = useState("");
  useEffect(() => setMenuOpen(false), [location.pathname, location.search]);

  // Aviso corto que otra pantalla deja al navegar (por ejemplo "Cambios guardados."). Se va solo y no vuelve al recargar.
  useEffect(() => {
    const text = (location.state as { notice?: string } | null)?.notice;
    if (!text) return;
    setNotice(text);
    window.history.replaceState({}, "");
    const timer = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(timer);
  }, [location.key]); // eslint-disable-line react-hooks/exhaustive-deps
  // Con el teclado abierto (celular) sobra todo lo fijo: se marca la página para que el menú de abajo y las barras
  // pegadas no tapen el campo que se está escribiendo (ver .kb-open en index.css).
  useEffect(() => {
    let off: ReturnType<typeof setTimeout>;
    const editable = (t: EventTarget | null) => t instanceof HTMLElement && t.matches("input:not([type=checkbox]):not([type=radio]), textarea, select");
    const on = (e: FocusEvent) => { if (editable(e.target)) { clearTimeout(off); document.documentElement.classList.add("kb-open"); } };
    const out = () => { off = setTimeout(() => document.documentElement.classList.remove("kb-open"), 120); };
    if (editable(document.activeElement)) document.documentElement.classList.add("kb-open"); // ya enfocado al cargar (autoFocus)
    document.addEventListener("focusin", on); document.addEventListener("focusout", out);
    return () => { document.removeEventListener("focusin", on); document.removeEventListener("focusout", out); clearTimeout(off); document.documentElement.classList.remove("kb-open"); };
  }, []);
  useEffect(() => { document.title = settings?.name ? `${settings.name} · Finanzas` : "Presupuestos y cobros"; }, [settings?.name]);

  // El contenido tiene siempre el mismo ancho máximo y va centrado. El menú se abre encima y no lo mueve.
  const column = "w-full mx-auto max-w-7xl px-4 sm:px-6 lg:px-8";

  return (
    <div className="min-h-dvh">
      <div className="pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
        {settings && !settings.payments_online && <p role="alert" className="bg-danger/10 text-danger text-xs text-center px-3 py-1 sm:px-4 sm:py-1.5"><span className="sm:hidden">Servicio de pagos no disponible por ahora.</span><span className="hidden sm:inline">El servicio de pagos no está disponible: por ahora no se pueden crear cobros ni registrar pagos.</span></p>}
        {settings?.mp_mock && <p role="note" className="bg-warning/15 text-[#7a5222] text-xs text-center px-3 py-1 sm:px-4 sm:py-1.5"><span className="sm:hidden">Modo piloto: pagos simulados.</span><span className="hidden sm:inline">Modo piloto: los pagos de Mercado Pago son simulados, no se cobra dinero real.</span></p>}
        <header className="bg-white border-b sticky top-0 z-30">
          <div className={cn(column, "h-14 flex items-center justify-between gap-4")}>
            <Link to="/" aria-label="Ir al inicio" className="flex items-center gap-2 font-semibold text-primary min-w-0 rounded-lg hover:opacity-80 justify-self-start">
              {settings?.logo_data_url ? (
                // El logo suele traer el nombre escrito: se muestra solo, ancho y legible.
                <img src={settings.logo_data_url} alt={settings.name || "Inicio"} className="h-9 w-auto max-w-44 object-contain" />
              ) : (
                <>
                  <img src="/logo.svg" alt="" className="h-7 w-7" />
                  <span className="truncate">{settings?.name || "Mi negocio"}</span>
                </>
              )}
            </Link>
            <div className="-mr-2"><MenuButton open={menuOpen} onToggle={() => setMenuOpen(!menuOpen)} /></div>
          </div>
        </header>

        <main className={cn(column, "py-4 md:py-8")}><Outlet /></main>

        {reportsOpen && <ReportsDialog open onOpenChange={setReportsOpen} onPrint={setPrintRange} />}
        {printRange && <PeriodReportSheet from={printRange.from} to={printRange.to} onDone={() => setPrintRange(null)} />}

        <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t grid grid-cols-4 z-30 pb-[env(safe-area-inset-bottom)]" aria-label="Principal">
          {NAV.map((item) => <NavItem key={item.to} item={item} active={isNavActive(item, location.pathname)} />)}
        </nav>
      </div>

      {notice && (
        <p role="status" className="fixed left-1/2 top-16 z-50 -translate-x-1/2 flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white shadow-[0_12px_28px_-12px_rgba(23,59,54,0.5)]">
          {notice}<CheckCircle2 size={16} />
        </p>
      )}

      {menuOpen && <MenuPanel onClose={() => setMenuOpen(false)} onReports={() => setReportsOpen(true)} />}
    </div>
  );
}
