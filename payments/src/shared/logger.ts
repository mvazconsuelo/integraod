/**
 * Logger que solo acepta datos simples (texto, número, booleano): no hay forma de registrar por error un cuerpo de pedido,
 * una credencial o un objeto completo.
 */
type Fields = Record<string, string | number | boolean>;
export const logger = {
  info: (event: string, fields: Fields = {}) => console.info(event, fields),
  warn: (event: string, fields: Fields = {}) => console.warn(event, fields),
  error: (event: string, fields: Fields = {}) => console.error(event, fields),
};
