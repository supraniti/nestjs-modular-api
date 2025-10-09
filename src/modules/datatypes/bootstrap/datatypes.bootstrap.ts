import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Collection, Document, MongoServerError } from 'mongodb';

import { MongoActionError } from '../../../lib/errors/MongoActionError';
import { MongodbService } from '../../mongodb/mongodb.service';
import {
  DATATYPES_COLLECTION,
  DATATYPE_SEEDS,
  type DataTypeDoc,
  type DataTypeDocBase,
  type DatatypeSeed,
  type DatatypeSeedField,
  type EntityField,
  type EntityIndexSpec,
  isDatatypeSeedKey,
} from '../internal';

interface SeedSyncStats {
  inserted: number;
  reconciled: number;
}

/**
 * Ensures baseline datatype seeds and indexes exist for local development.
 * - Skips in CI or when explicitly disabled.
 * - Idempotently reconciles seed documents.
 */
@Injectable()
export class DatatypesBootstrap implements OnModuleInit {
  private readonly logger = new Logger(DatatypesBootstrap.name);

  constructor(private readonly mongo: MongodbService) {}

  public async onModuleInit(): Promise<void> {
    if (!shouldRunBootstrap()) {
      this.logger.log('Skipping datatypes bootstrap (CI or disabled by env).');
      return;
    }

    try {
      const db = await this.mongo.getDb();
      const coll = db.collection<DataTypeDocBase>(DATATYPES_COLLECTION);
      await this.ensureIndexes(coll);
      const stats = await this.syncSeeds(coll);
      this.logger.log(
        `Datatypes bootstrap complete (inserted ${stats.inserted}, reconciled ${stats.reconciled}).`,
      );
    } catch (err: unknown) {
      const wrapped = MongoActionError.wrap(err, {
        operation: 'datatypesBootstrap',
      });
      const message =
        wrapped instanceof Error ? wrapped.message : String(wrapped);
      this.logger.error(message);
      throw wrapped;
    }
  }

  private async ensureIndexes(
    coll: Collection<DataTypeDocBase>,
  ): Promise<void> {
    try {
      await coll.createIndex(
        { keyLower: 1 },
        { unique: true, name: 'uniq_datatypes_keyLower' },
      );
    } catch (err: unknown) {
      if (isDuplicateKeyError(err)) {
        const duplicates = await this.findDuplicateKeyLowers(coll);
        const detail =
          duplicates.length === 0
            ? 'duplicate keyLower values exist'
            : duplicates
                .map((d) => {
                  const keyLower =
                    typeof d.keyLower === 'string'
                      ? d.keyLower
                      : String(d.keyLower);
                  const keys = Array.isArray(d.keys)
                    ? d.keys.filter((k): k is string => typeof k === 'string')
                    : [];
                  return keys.length > 0
                    ? `${keyLower} (${keys.join(', ')})`
                    : keyLower;
                })
                .join(', ');
        throw new Error(
          `Failed to create unique index "uniq_datatypes_keyLower" due to duplicates: ${detail}.`,
        );
      }
      throw err;
    }
  }

  private async findDuplicateKeyLowers(
    coll: Collection<DataTypeDocBase>,
  ): Promise<ReadonlyArray<{ keyLower: unknown; keys?: unknown }>> {
    try {
      const cursor = coll.aggregate<{
        _id: unknown;
        keys?: unknown;
        keyLower?: unknown;
      }>([
        {
          $group: {
            _id: '$keyLower',
            keys: { $addToSet: '$key' },
            count: { $sum: 1 },
          },
        },
        { $match: { count: { $gt: 1 } } },
        { $project: { _id: 0, keyLower: '$_id', keys: 1 } },
      ]);
      const results = await cursor.toArray();
      return results.map((r) => ({ keyLower: r.keyLower, keys: r.keys }));
    } catch (aggregateErr) {
      this.logger.warn(
        `Failed to inspect duplicate keyLower values: ${String(aggregateErr)}`,
      );
      return [];
    }
  }

  private async syncSeeds(
    coll: Collection<DataTypeDocBase>,
  ): Promise<SeedSyncStats> {
    const now = new Date();
    let inserted = 0;
    let reconciled = 0;

    for (const seed of DATATYPE_SEEDS) {
      const existing = (await coll.findOne({
        keyLower: seed.keyLower,
      } as Document)) as DataTypeDoc | null;

      if (!existing) {
        const insertDoc: DataTypeDocBase = this.buildInsertDoc(seed, now);
        await coll.insertOne(insertDoc as unknown as DataTypeDocBase);
        inserted += 1;
        this.logger.log(`Inserted seed datatype: ${seed.key}`);
        continue;
      }

      const needsUpdate = seedRequiresUpdate(existing, seed);
      if (needsUpdate) {
        const setUpdate = this.buildUpdateDoc(seed, now);
        await coll.updateOne(
          { _id: existing._id } as Document,
          { $set: setUpdate } as Document,
        );
      }
      reconciled += 1;
      this.logger.log(`Reconciled seed datatype: ${seed.key}`);
      if (!needsUpdate) {
        this.logger.log(`Seed datatype already up to date: ${seed.key}`);
      }
    }

    const lockedDocs = await coll
      .find({ locked: true } as Document, {
        projection: { key: 1, keyLower: 1 },
      })
      .toArray();

    for (const doc of lockedDocs) {
      const record = doc as Document;
      const keyLower =
        typeof record.keyLower === 'string' ? record.keyLower : undefined;
      if (!keyLower || isDatatypeSeedKey(keyLower)) {
        continue;
      }
      const key = typeof record.key === 'string' ? record.key : keyLower;
      this.logger.warn(
        `Locked datatype not in seed set: "${key}" (left untouched).`,
      );
    }

    return { inserted, reconciled };
  }

  private buildInsertDoc(seed: DatatypeSeed, now: Date): DataTypeDocBase {
    return {
      key: seed.key,
      keyLower: seed.keyLower,
      label: seed.label,
      status: seed.status,
      version: seed.version,
      fields: seed.fields.map(cloneFieldForWrite),
      storage: { mode: seed.storage.mode },
      indexes: seed.indexes.map(cloneIndexForWrite),
      locked: true,
      createdAt: now,
      updatedAt: now,
    };
  }

  private buildUpdateDoc(
    seed: DatatypeSeed,
    now: Date,
  ): Partial<DataTypeDocBase> {
    return {
      label: seed.label,
      status: seed.status,
      version: seed.version,
      fields: seed.fields.map(cloneFieldForWrite),
      storage: { mode: seed.storage.mode },
      indexes: seed.indexes.map(cloneIndexForWrite),
      locked: true,
      updatedAt: now,
    };
  }
}

function cloneFieldForWrite(field: DatatypeSeedField): EntityField {
  return {
    fieldKey: field.fieldKey,
    required: field.required,
    array: field.array,
    ...(field.unique !== undefined ? { unique: field.unique } : {}),
    ...(field.constraints !== undefined
      ? { constraints: { ...field.constraints } }
      : {}),
    ...(field.order !== undefined ? { order: field.order } : {}),
  };
}

function cloneIndexForWrite(index: EntityIndexSpec): EntityIndexSpec {
  const options = index.options
    ? {
        ...index.options,
        ...(index.options.partialFilterExpression
          ? {
              partialFilterExpression: {
                ...index.options.partialFilterExpression,
              },
            }
          : {}),
      }
    : undefined;

  return {
    keys: { ...index.keys },
    ...(options ? { options } : {}),
  };
}

function seedRequiresUpdate(
  existing: DataTypeDoc,
  seed: DatatypeSeed,
): boolean {
  if (existing.label !== seed.label) return true;
  if (existing.status !== seed.status) return true;
  if (existing.version !== seed.version) return true;
  if (existing.locked !== true) return true;
  if (existing.storage?.mode !== seed.storage.mode) return true;
  if (!fieldsEqual(existing.fields, seed.fields)) return true;
  if (!indexesEqual(existing.indexes ?? [], seed.indexes)) return true;
  return false;
}

function fieldsEqual(
  current: ReadonlyArray<EntityField>,
  seed: ReadonlyArray<EntityField>,
): boolean {
  if (current.length !== seed.length) {
    return false;
  }
  return current.every(
    (field, index) =>
      stableStringify(normalizeField(field)) ===
      stableStringify(normalizeField(seed[index])),
  );
}

function indexesEqual(
  current: ReadonlyArray<EntityIndexSpec>,
  seed: ReadonlyArray<EntityIndexSpec>,
): boolean {
  if (current.length !== seed.length) {
    return false;
  }
  return current.every(
    (index, idx) =>
      stableStringify(normalizeIndex(index)) ===
      stableStringify(normalizeIndex(seed[idx])),
  );
}

function normalizeField(field: EntityField): Record<string, unknown> {
  const normalized: Record<string, unknown> = {
    fieldKey: field.fieldKey,
    required: field.required,
    array: field.array,
  };
  if (field.unique !== undefined) {
    normalized.unique = field.unique;
  }
  if (field.constraints !== undefined) {
    normalized.constraints = field.constraints;
  }
  if (field.order !== undefined) {
    normalized.order = field.order;
  }
  return normalized;
}

function normalizeIndex(index: EntityIndexSpec): Record<string, unknown> {
  const normalized: Record<string, unknown> = {
    keys: Object.entries(index.keys),
  };
  if (index.options) {
    normalized.options = normalizeIndexOptions(index.options);
  }
  return normalized;
}

function normalizeIndexOptions(
  options: NonNullable<EntityIndexSpec['options']>,
): Record<string, unknown> {
  return {
    ...options,
    ...(options.partialFilterExpression
      ? { partialFilterExpression: options.partialFilterExpression }
      : {}),
  };
}

function stableStringify(value: unknown): string {
  if (value === undefined) {
    return 'undefined';
  }
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (value instanceof Date) {
    return `"${value.toISOString()}"`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0),
    );
    return `{${entries
      .map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function isDuplicateKeyError(err: unknown): err is MongoServerError {
  if (!err || typeof err !== 'object') return false;
  const code = (err as MongoServerError).code;
  return typeof code === 'number' && code === 11000;
}

/** Bootstrap gating: run locally, skip on CI or when disabled explicitly. */
function shouldRunBootstrap(): boolean {
  const ci = String(process.env.CI ?? '').toLowerCase();
  if (ci === 'true' || ci === '1') return false;
  const flag = String(process.env.DATATYPES_BOOTSTRAP ?? '1').toLowerCase();
  return flag !== '0' && flag !== 'false';
}
