export class AppError extends Error {
  constructor(public status: 400 | 401 | 403 | 404 | 409 | 422 | 429 | 502, message: string, public code = "error") {
    super(message);
  }
}
