import { Button } from "@/components/ui/button";

export function ErrorMessage({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger flex items-center justify-between gap-3">
      <span>{message}</span>
      {onRetry && <Button size="sm" variant="secondary" onClick={onRetry}>Reintentar</Button>}
    </div>
  );
}

export const Loading = () => <p className="text-sm text-muted py-8 text-center">Cargando…</p>;
