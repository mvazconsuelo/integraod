import { createBrowserRouter, Navigate } from "react-router-dom";
import { AuthGate, SettingsProvider } from "@/app/providers";
import { AppShell } from "@/components/layout/AppShell";
import { HomePage } from "@/features/home/pages/HomePage";
import { ActivityPage } from "@/features/activity/pages/ActivityPage";
import { ControlPage } from "@/features/dashboard/pages/ControlPage";
import { BudgetsPage } from "@/features/budgets/pages/BudgetsPage";
import { BudgetDetailPage } from "@/features/budgets/pages/BudgetDetailPage";
import { BudgetEditorPage } from "@/features/budgets/pages/BudgetEditorPage";
import { PaymentsPage } from "@/features/payments/pages/PaymentsPage";
import { PaymentDetailPage } from "@/features/payments/pages/PaymentDetailPage";
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
      { path: "actividad", element: <ActivityPage /> },
      { path: "control", element: <ControlPage /> },
      { path: "presupuestos", element: <BudgetsPage /> },
      { path: "presupuestos/nuevo", element: <BudgetEditorPage /> },
      { path: "presupuestos/:id/editar", element: <BudgetEditorPage /> },
      { path: "presupuestos/:id", element: <BudgetDetailPage /> },
      { path: "cobros", element: <PaymentsPage /> },
      { path: "cobros/:id", element: <PaymentDetailPage /> },
      { path: "contactos", element: <PatientsPage /> },
      { path: "contactos/:name", element: <PatientDetailPage /> },
      { path: "configuracion", element: <SettingsPage /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);

