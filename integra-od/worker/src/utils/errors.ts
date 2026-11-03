export class AppError extends Error {
  constructor(
    public status: 400 | 401 | 404 | 409 | 422 | 429 | 502,
    message: string,
    public code = "error",
    /** Datos para que la pantalla explique mejor (por ejemplo, qué pagos impiden cancelar). */
    public details?: unknown,
  ) {
    super(message);
  }
}
