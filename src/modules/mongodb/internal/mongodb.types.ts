// Thin wrapper: keep only minimal helpers and re-export official driver types.
import type { Db } from 'mongodb';

/** Default DB name used when callers don't pass one. */
export const DEFAULT_DB_NAME = 'modapi' as const;

/** Basic guard used only for collection name sanity. */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/** Signature for a function that returns a Db instance for a given name. */
export type GetDb = (dbName?: string) => Promise<Db>;

/* Re-export official driver types so callers can import from our module without duplication. */
export type {
  BulkWriteOptions,
  Collection,
  CollectionOptions,
  CountDocumentsOptions,
  CreateCollectionOptions,
  Db as MongoDb,
  DeleteOptions,
  DeleteResult,
  Document,
  Filter,
  FindCursor,
  FindOptions,
  InsertManyResult,
  InsertOneResult,
  MongoServerError,
  OptionalUnlessRequiredId,
  UpdateFilter,
  UpdateOptions,
  UpdateResult,
  WithId,
} from 'mongodb';
