import type { ReactNode } from "react";

interface Props {
  title: string; subtitle?: string; action?: ReactNode;
  /** En el celular reemplaza a `action`: va al lado del título, en la misma fila (ahorra una fila entera). */
  mobileAction?: ReactNode;
}

export function PageHeader({ title, subtitle, action, mobileAction }: Props) {
  return (
    <div className="mb-5 sm:mb-8 sm:flex sm:flex-wrap sm:items-end sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
          {mobileAction && <div className="shrink-0 sm:hidden">{mobileAction}</div>}
        </div>
        {subtitle && <p className="mt-1 text-sm text-muted sm:mt-1.5 sm:text-base">{subtitle}</p>}
      </div>
      {action && <div className={mobileAction ? "hidden sm:block" : "mt-3 w-full sm:mt-0 sm:w-auto"}>{action}</div>}
    </div>
  );
}
