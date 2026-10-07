// An error we throw on purpose ("expected" failures like 401, 404, 409).
// Anything that is NOT an AppError is treated as a bug and returned as a generic 500.
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code = 'ERROR',
  ) {
    super(message);
    this.name = 'AppError';
  }
}
