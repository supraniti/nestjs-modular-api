import { AppError } from '../../lib/errors/AppError';

/**
 * Entities module domain errors.
 * All extend AppError for predictable HTTP 400 mapping.
 * Constructor signature aligns with your AppError: (message: string, code?: string)
 */

export class UnknownDatatypeError extends AppError {
  constructor(readonly typeKey: string) {
    super(`Unknown datatype: ${typeKey}`, 'ENTITIES_UNKNOWN_DATATYPE');
  }
}

export class UnpublishedDatatypeError extends AppError {
  constructor(readonly typeKey: string) {
    super(
      `Datatype exists but is not published: ${typeKey}`,
      'ENTITIES_UNPUBLISHED_DATATYPE',
    );
  }
}

export class ValidationError extends AppError {
  constructor(
    readonly typeKey: string,
    readonly details: Record<string, unknown>,
  ) {
    super(
      `Validation failed for datatype: ${typeKey}`,
      'ENTITIES_VALIDATION_FAILED',
    );
  }
}

export class UniqueViolationError extends AppError {
  constructor(
    readonly typeKey: string,
    readonly fieldKey: string,
    readonly value: unknown,
  ) {
    super(
      `Unique constraint violated on '${fieldKey}' for datatype: ${typeKey}`,
      'ENTITIES_UNIQUE_VIOLATION',
    );
  }
}

export class EntityNotFoundError extends AppError {
  constructor(
    readonly typeKey: string,
    readonly idHex: string,
  ) {
    super(
      `Entity not found for datatype ${typeKey} with id ${idHex}`,
      'ENTITIES_NOT_FOUND',
    );
  }
}

export class CollectionResolutionError extends AppError {
  constructor(
    readonly typeKey: string,
    readonly reason: string,
  ) {
    super(
      `Failed to resolve collection for datatype ${typeKey}: ${reason}`,
      'ENTITIES_COLLECTION_RESOLUTION',
    );
  }
}
