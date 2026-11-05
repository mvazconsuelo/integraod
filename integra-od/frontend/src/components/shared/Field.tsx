import type { ReactNode } from "react";

export function Field({ label, error, hint, required, plain, className, children }: { className?: string; label: string; error?: string; hint?: string; required?: boolean; /** Para controles con botones propios: el título no debe activarlos. */ plain?: boolean; children: ReactNode }) {
  const Wrapper = plain ? "div" : "label";
  return (
    <Wrapper className={`block space-y-2 ${className ?? ""}`}>
      <span className="block text-sm font-semibold">{label}{required && <span className="text-danger" aria-hidden> *</span>}</span>
      {children}
      {hint && !error && <span className="block text-xs text-muted">{hint}</span>}
      {error && <span className="block text-xs text-danger" role="alert">{error}</span>}
    </Wrapper>
  );
}
