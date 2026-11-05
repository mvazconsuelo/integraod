import { Navigate, useParams } from "react-router-dom";
import { ErrorMessage, Loading } from "@/components/feedback/ErrorMessage";
import { useApi } from "@/hooks/useApi";
import type { PaymentRequest } from "@/types";

/** Los enlaces viejos a un cobro llevan al presupuesto al que pertenece. */
export function LegacyRequestRedirect() {
  const { id = "" } = useParams();
  const { data, error, loading } = useApi<PaymentRequest>(`/payments/${id}`);
  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorMessage message={error ?? "No encontramos ese cobro."} />;
  return <Navigate to={data.budget_id ? `/presupuestos/${data.budget_id}` : "/presupuestos"} replace />;
}
