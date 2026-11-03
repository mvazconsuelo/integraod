import type { ReactNode } from "react";

export function Field({ label, error, hint, required, plain, children }: { label: string; error?: string; hint?: string; required?: boolean; /** Para controles con botones propios: el título no debe activarlos. */ plain?: boolean; children: ReactNode }) {
  const Wrapper = plain ? "div" : "label";
  return (
    <Wrapper className="block space-y-1.5">
      <span className="text-sm font-medium">{label}{required && <span className="text-danger" aria-hidden> *</span>}</span>
      {children}
      {hint && !error && <span className="block text-xs text-muted">{hint}</span>}
      {error && <span className="block text-xs text-danger" role="alert">{error}</span>}
    </Wrapper>
  );
}
