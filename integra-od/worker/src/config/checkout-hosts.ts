/**
 * Destinos de pago permitidos en la página que ve el cliente. El servicio de pagos ya valida el link al crearlo;
 * esto es una segunda barrera por si algún dato se alterara: el botón "Pagar" nunca lleva a un dominio ajeno.
 * Al sumar un proveedor nuevo, agregar acá su dominio.
 */
const ALLOWED = [
  /^\/mock-checkout\/[A-Za-z0-9_-]{16,}$/,                          // pantalla simulada del piloto
  /^https:\/\/([a-z0-9-]+\.)*mercadopago\.(com(\.[a-z]{2})?|cl)\//, // Mercado Pago
];

export const isSafeCheckoutUrl = (url: string | null): url is string => Boolean(url) && ALLOWED.some((re) => re.test(url as string));
