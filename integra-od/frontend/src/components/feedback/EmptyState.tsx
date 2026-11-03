import type { ReactNode } from "react";

export function EmptyState({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed bg-white px-6 py-12 text-center">
      <p className="text-muted max-w-sm mx-auto">{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
