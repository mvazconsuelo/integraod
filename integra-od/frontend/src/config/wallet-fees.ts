/**
 * Comisiones de referencia de Mercado Pago para cobrar online, tal como las publica en su página de Link de pago (Argentina).
 * Son informativas: cambian, y dependen de la provincia, del medio de pago y del plazo. Para actualizarlas, cambiar acá y la fecha.
 */
export const MP_FEE_REFERENCE = {
  asOf: "consultados en noviembre de 2026",
  source: "https://www.mercadopago.com.ar/herramientas-para-vender/link-de-pago",
  terms: [
    { label: "Al instante", percent: "6,29 %" },
    { label: "En 10 días", percent: "4,39 %" },
    { label: "En 18 días", percent: "3,39 %" },
    { label: "En 35 días", percent: "1,49 %" },
  ],
} as const;
