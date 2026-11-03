import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface Props {
  title: string; subtitle?: string; action?: ReactNode; icon?: LucideIcon;
  /** En el celular reemplaza a `action`: va al lado del título, en la misma fila (ahorra una fila entera). */
  mobileAction?: ReactNode;
}

export function PageHeader({ title, subtitle, action, mobileAction, icon: Icon }: Props) {
  return (
    <div className="mb-6 sm:mb-8 sm:flex sm:flex-wrap sm:items-end sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <div className="flex items-center justify-between gap-3">
          <h1 className="flex items-center gap-3 text-[28px] font-semibold leading-tight tracking-tight sm:text-4xl">
            {Icon && <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary sm:h-12 sm:w-12"><Icon size={24} /></span>}
            {title}
          </h1>
          {mobileAction && <div className="shrink-0 sm:hidden">{mobileAction}</div>}
        </div>
        {subtitle && <p className="mt-1.5 text-[15px] text-muted sm:text-base">{subtitle}</p>}
      </div>
      {action && <div className={mobileAction ? "hidden sm:block" : "mt-3 w-full sm:mt-0 sm:w-auto"}>{action}</div>}
    </div>
  );
}
