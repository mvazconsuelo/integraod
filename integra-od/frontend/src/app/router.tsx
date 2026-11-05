import { createBrowserRouter, Navigate } from "react-router-dom";
import { AuthGate, SettingsProvider } from "@/app/providers";
import { AppShell } from "@/components/layout/AppShell";
import { HomePage } from "@/features/home/pages/HomePage";
import { ControlPage } from "@/features/dashboard/pages/ControlPage";
import { BudgetsPage } from "@/features/budgets/pages/BudgetsPage";
import { BudgetDetailPage } from "@/features/budgets/pages/BudgetDetailPage";
import { BudgetEditorPage } from "@/features/budgets/pages/BudgetEditorPage";
import { NewBudgetFlow } from "@/features/budgets/pages/NewBudgetFlow";
import { LegacyRequestRedirect } from "@/features/payments/pages/LegacyRequestRedirect";
import { PatientsPage } from "@/features/patients/pages/PatientsPage";
import { PatientDetailPage } from "@/features/patients/pages/PatientDetailPage";
import { SettingsPage } from "@/features/settings/pages/SettingsPage";
import { PublicPaymentPage } from "@/features/public-payment/PublicPaymentPage";
import { MockCheckoutPage } from "@/features/mock-checkout/MockCheckoutPage";

const Private = () => (
  <AuthGate>
    <SettingsProvider>
      <AppShell />
    </SettingsProvider>
  </AuthGate>
);

export const router = createBrowserRouter([
  { path: "/pay/:publicId", element: <PublicPaymentPage /> },
  { path: "/mock-checkout/:publicId", element: <MockCheckoutPage /> },
  {
    element: <Private />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "actividad", element: <Navigate to="/control?vista=historial" replace /> }, // el historial vive en Métricas
      { path: "control", element: <ControlPage /> },
      { path: "presupuestos", element: <BudgetsPage /> },
      { path: "presupuestos/nuevo", element: <NewBudgetFlow /> },
      { path: "presupuestos/:id/editar", element: <BudgetEditorPage /> },
      { path: "presupuestos/:id", element: <BudgetDetailPage /> },
      // Cobros ya no es una sección: sus pedidos viven dentro de cada concepto.
      { path: "contactos", element: <Navigate to="/clientes" replace /> }, // enlaces viejos
      { path: "cobros", element: <Navigate to="/presupuestos?estado=pendientes" replace /> },
      { path: "cobros/:id", element: <LegacyRequestRedirect /> },
      { path: "clientes", element: <PatientsPage /> },
      { path: "clientes/:name", element: <PatientDetailPage /> },
      { path: "configuracion", element: <SettingsPage /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);

