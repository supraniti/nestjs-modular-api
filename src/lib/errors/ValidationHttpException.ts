import { HttpException, HttpStatus } from '@nestjs/common';

export interface ValidationIssue {
  path: string;
  message: string;
  keyword?: string;
}

export class ValidationHttpException extends HttpException {
  constructor(details: ValidationIssue[]) {
    super(
      {
        error: 'ValidationError',
        message: 'Validation failed',
        details,
      },
      HttpStatus.BAD_REQUEST,
    );
    this.name = 'ValidationHttpException';
  }
}
