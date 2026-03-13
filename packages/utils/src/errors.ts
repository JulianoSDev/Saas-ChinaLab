export class AppError extends Error {
  constructor(
    public message: string,
    public code: string = 'INTERNAL_ERROR',
    public statusCode: number = 500,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class FreightError extends AppError {
  constructor(message: string) {
    super(message, 'FREIGHT_ERROR', 502);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 'NOT_FOUND', 404);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', 400);
  }
}
