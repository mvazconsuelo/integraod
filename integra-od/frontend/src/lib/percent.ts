/** El porcentaje de un importe (en centavos), redondeado a pesos enteros: 30 % de $ 300.000 = $ 90.000. */
export const percentOfCents = (totalCents: number, pct: number) => Math.round((totalCents * pct) / 10_000) * 100;
