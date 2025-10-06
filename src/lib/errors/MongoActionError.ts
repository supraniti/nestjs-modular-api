import { AppError } from './AppError';

/**
 * Canonical Mongo operation names that this module may perform.
 * Extend freely without churn to callers (string intersection keeps it open).
 */
export type MongoOperation =
  | 'listCollections'
  | 'dbStats'
  | 'createCollection'
  | 'dropCollection'
  | 'collectionStats'
  | 'insertOne'
  | 'insertMany'
  | 'find'
  | 'countDocuments'
  | 'updateOne'
  | 'updateMany'
  | 'deleteOne'
  | 'deleteMany'
  | (string & {});

/**
 * Lightweight, structured context attached to Mongo errors.
 */
export interface MongoErrorContext {
  /** Logical operation being attempted (e.g., "insertOne"). */
  readonly operation: MongoOperation;
  /** Optional database name (defaults may apply). */
  readonly dbName?: string;
  /** Optional collection name (not all ops have collections). */
  readonly collection?: string;
  /**
   * Optional, sanitized arguments preview (never full documents unless safe).
   * Keep this minimal to avoid leaking sensitive payload details.
   */
  readonly argsPreview?: Readonly<Record<string, unknown>>;
  /** Optional driver error code (e.g., from MongoServerError.code). */
  readonly driverCode?: number | string;
}

/**
 * A typed application error indicating a failure during a MongoDB action.
 * Wraps the original driver error (if any) and carries safe, structured context.
 */
export class MongoActionError extends AppError {
  public readonly name = 'MongoActionError' as const;
  public readonly context: Readonly<MongoErrorContext>;
  // Keep our own copy of the cause to avoid relying on AppError's shape.
  // NOTE: We intentionally do NOT define a `cause` accessor to avoid overriding.
  private readonly _cause?: Error;

  constructor(message: string, context: MongoErrorContext, cause?: Error) {
    super(message);
    this.context = Object.freeze({ ...context });
    this._cause = cause;
  }

  /** Human-readable summary for logs. */
  public summary(): string {
    const parts: string[] = [
      `op=${this.context.operation}`,
      this.context.dbName ? `db=${this.context.dbName}` : undefined,
      this.context.collection ? `coll=${this.context.collection}` : undefined,
      this.context.driverCode !== undefined
        ? `driverCode=${String(this.context.driverCode)}`
        : undefined,
    ].filter(Boolean) as string[];
    return `Mongo action failed: ${parts.join(' ')}`;
  }

  /** JSON-safe representation (e.g., for structured logs). */
  public toJSON(): {
    name: string;
    message: string;
    context: MongoErrorContext;
    cause?: { name: string; message: string };
  } {
    const c = this._cause;
    return {
      name: this.name,
      message: this.message,
      context: this.context,
      cause: c ? { name: c.name, message: c.message } : undefined,
    };
  }

  /**
   * Helper to wrap a thrown error into a MongoActionError with consistent context.
   * If the error is already a MongoActionError, it will be returned as-is.
   */
  public static wrap(
    err: unknown,
    context: MongoErrorContext,
    fallbackMessage = 'Mongo action failed',
  ): MongoActionError {
    if (err instanceof MongoActionError) {
      return err;
    }
    const { message, driverCode } = extractDriverDetails(err);
    return new MongoActionError(
      message ?? fallbackMessage,
      { ...context, driverCode },
      asError(err),
    );
  }
}

/** Narrow an unknown into an Error (best effort) without using `any`. */
function asError(value: unknown): Error | undefined {
  if (value instanceof Error) return value;
  return undefined;
}

/**
 * Attempt to extract a useful message/code from Mongo driver errors
 * (e.g., MongoServerError, MongoRuntimeError). Keeps types conservative.
 */
function extractDriverDetails(err: unknown): {
  message?: string;
  driverCode?: number | string;
} {
  if (err && typeof err === 'object') {
    const maybe: Record<string, unknown> = err as Record<string, unknown>;
    const message =
      typeof maybe.message === 'string' && maybe.message.length > 0
        ? maybe.message
        : undefined;
    const code =
      typeof maybe.code === 'number' || typeof maybe.code === 'string'
        ? maybe.code
        : undefined;
    return { message, driverCode: code };
  }
  return {};
}
