import { Injectable } from '@nestjs/common';
import type { Collection } from 'mongodb';
import { MongodbService } from '../mongodb/mongodb.service';
import {
  FIELDS_COLLECTION,
  type FieldKind,
  type FieldDocBase,
  type FieldDoc,
  isFieldKind,
  isKebabCaseKey,
  normalizeKeyLower,
  LOCKED_MUTABLE_PROPS,
} from './internal';
import { MongoActionError } from '../../lib/errors/MongoActionError';

@Injectable()
export class FieldsService {
  constructor(private readonly mongo: MongodbService) {}

  /* =========================
   *       Public API
   * ========================= */

  /** List all fields (seed + custom). */
  public async list(dbName?: string): Promise<ReadonlyArray<FieldDoc>> {
    try {
      const coll = await this.getCollection(dbName);
      const docs = await coll.find({}).toArray(); // WithId<FieldDocBase>[]
      return docs;
    } catch (err) {
      throw MongoActionError.wrap(err, { operation: 'fields.list', dbName });
    }
  }

  /** Get a field by kebab-case key. */
  public async getByKey(
    key: string,
    dbName?: string,
  ): Promise<FieldDoc | null> {
    if (!isKebabCaseKey(key)) {
      throw new MongoActionError('Field key must be kebab-case', {
        operation: 'fields.getByKey',
        argsPreview: { key },
        dbName,
      });
    }
    const keyLower = normalizeKeyLower(key);
    try {
      const coll = await this.getCollection(dbName);
      const doc = await coll.findOne({ keyLower }); // WithId<FieldDocBase> | null
      return doc;
    } catch (err) {
      throw MongoActionError.wrap(err, {
        operation: 'fields.getByKey',
        argsPreview: { key },
        dbName,
      });
    }
  }

  /**
   * Create a **custom** field (non-locked).
   * - key must be kebab-case and unique (case-insensitive).
   * - kind must be a valid FieldKind (Stage 1 kinds).
   */
  public async create(
    input: { key: string; label: string; kind: FieldKind },
    dbName?: string,
  ): Promise<FieldDoc> {
    const { key, label, kind } = input;

    if (!isKebabCaseKey(key)) {
      throw new MongoActionError('Field key must be kebab-case', {
        operation: 'fields.create',
        argsPreview: { key },
        dbName,
      });
    }
    if (!isFieldKind(kind)) {
      throw new MongoActionError('Invalid field kind', {
        operation: 'fields.create',
        argsPreview: { kind: summarize(kind) },
        dbName,
      });
    }

    const keyLower = normalizeKeyLower(key);
    const now = new Date();

    try {
      const coll = await this.getCollection(dbName);

      // Uniqueness check (case-insensitive)
      const existing = await coll.findOne({ keyLower });
      if (existing) {
        throw new MongoActionError('Field key already exists', {
          operation: 'fields.create',
          argsPreview: { key },
          dbName,
        });
      }

      const doc: FieldDocBase = {
        key,
        keyLower,
        label,
        kind,
        locked: false,
        createdAt: now,
        updatedAt: now,
      };

      const res = await coll.insertOne(doc);
      const created = await coll.findOne({ _id: res.insertedId });
      if (!created) {
        throw new MongoActionError('Failed to load created field', {
          operation: 'fields.create',
          dbName,
        });
      }
      return created;
    } catch (err) {
      throw MongoActionError.wrap(err, {
        operation: 'fields.create',
        argsPreview: { key, label, kind: summarize(kind) },
        dbName,
      });
    }
  }

  /**
   * Update a field by key.
   * - Locked fields: only `label` may be updated (Stage 1 policy).
   * - Custom fields: `label` and `kind` may be updated.
   */
  public async updateByKey(
    key: string,
    patch: { label?: string; kind?: FieldKind },
    dbName?: string,
  ): Promise<FieldDoc> {
    if (!isKebabCaseKey(key)) {
      throw new MongoActionError('Field key must be kebab-case', {
        operation: 'fields.updateByKey',
        argsPreview: { key },
        dbName,
      });
    }
    if (patch.kind !== undefined && !isFieldKind(patch.kind)) {
      throw new MongoActionError('Invalid field kind', {
        operation: 'fields.updateByKey',
        argsPreview: { kind: summarize(patch.kind) },
        dbName,
      });
    }

    const keyLower = normalizeKeyLower(key);
    const now = new Date();

    try {
      const coll = await this.getCollection(dbName);

      const existing = await coll.findOne({ keyLower });
      if (!existing) {
        throw new MongoActionError('Field not found', {
          operation: 'fields.updateByKey',
          argsPreview: { key },
          dbName,
        });
      }

      const isLocked = !!existing.locked;

      // Build a MUTABLE $set document (avoid readonly writes)
      const setUpdate: Record<string, unknown> = { updatedAt: now };

      if (patch.label !== undefined) {
        setUpdate.label = patch.label;
      }
      if (patch.kind !== undefined) {
        if (isLocked) {
          // Enforce Stage 1 policy for locked seeds.
          throw new MongoActionError(
            `Locked field can only update: ${LOCKED_MUTABLE_PROPS.join(', ')}`,
            {
              operation: 'fields.updateByKey',
              argsPreview: { key },
              dbName,
            },
          );
        }
        setUpdate.kind = patch.kind;
      }

      // Disallow no-op updates
      const setKeys = Object.keys(setUpdate);
      if (setKeys.length <= 1 && setKeys[0] === 'updatedAt') {
        // nothing to update
        return existing;
      }

      await coll.updateOne({ _id: existing._id }, { $set: setUpdate });

      const updated = await coll.findOne({ _id: existing._id });
      if (!updated) {
        throw new MongoActionError('Failed to load updated field', {
          operation: 'fields.updateByKey',
          argsPreview: { key },
          dbName,
        });
      }
      return updated;
    } catch (err) {
      throw MongoActionError.wrap(err, {
        operation: 'fields.updateByKey',
        argsPreview: { key, patch: summarize(patch) },
        dbName,
      });
    }
  }

  /** Delete a custom (non-locked) field by key. */
  public async deleteByKey(
    key: string,
    dbName?: string,
  ): Promise<{ deleted: boolean }> {
    if (!isKebabCaseKey(key)) {
      throw new MongoActionError('Field key must be kebab-case', {
        operation: 'fields.deleteByKey',
        argsPreview: { key },
        dbName,
      });
    }
    const keyLower = normalizeKeyLower(key);

    try {
      const coll = await this.getCollection(dbName);
      const existing = await coll.findOne({ keyLower });
      if (!existing) {
        return { deleted: false };
      }
      if (existing.locked) {
        throw new MongoActionError('Cannot delete a locked (seed) field', {
          operation: 'fields.deleteByKey',
          argsPreview: { key },
          dbName,
        });
      }
      const res = await coll.deleteOne({ _id: existing._id });
      return { deleted: (res.deletedCount ?? 0) > 0 };
    } catch (err) {
      throw MongoActionError.wrap(err, {
        operation: 'fields.deleteByKey',
        argsPreview: { key },
        dbName,
      });
    }
  }

  /* =========================
   *         internals
   * ========================= */

  private async getCollection(
    dbName?: string,
  ): Promise<Collection<FieldDocBase>> {
    const db = await this.mongo.getDb(dbName);
    const coll: Collection<FieldDocBase> =
      db.collection<FieldDocBase>(FIELDS_COLLECTION);
    return coll;
  }
}

/* -------------------------------------
 * tiny preview helper (log-friendly)
 * ------------------------------------- */
function summarize(v: unknown): unknown {
  if (v == null) return v;
  const t = typeof v;
  if (t === 'string')
    return (v as string).length > 120 ? `${(v as string).slice(0, 117)}...` : v;
  if (t === 'number' || t === 'boolean') return v;
  if (Array.isArray(v)) return `[array(${v.length})]`;
  if (t === 'object') return '[object]';
  return `[${t}]`;
}
