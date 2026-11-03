import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Un bloque de la pantalla: título con su ícono y el contenido adentro, en una superficie blanca. */
export function Section({ title, icon: Icon, action, children, className, flush }: { title?: string; icon?: LucideIcon; action?: ReactNode; children: ReactNode; className?: string; /** Sin relleno: para listas que llegan hasta el borde. */ flush?: boolean }) {
  return (
    <section aria-label={title} className={cn("overflow-hidden rounded-3xl border bg-white", className)}>
      {title && (
        <div className={cn("flex items-center justify-between gap-3", flush ? "px-5 pt-5 pb-2 sm:px-6" : "px-5 pt-5 sm:px-6")}>
          <h2 className="flex items-center gap-2.5 text-lg font-semibold">
            {Icon && <span aria-hidden className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-primary"><Icon size={18} /></span>}
            {title}
          </h2>
          {action}
        </div>
      )}
      <div className={flush ? "" : "p-5 sm:p-6" + (title ? " pt-4 sm:pt-4" : "")}>{children}</div>
    </section>
  );
}
