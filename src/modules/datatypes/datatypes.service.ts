import { Injectable } from '@nestjs/common';
import type { Collection, Db } from 'mongodb';
import { MongodbService } from '../mongodb/mongodb.service';
import {
  DATATYPES_COLLECTION,
  type DataTypeDocBase,
  type DataTypeDoc,
  type EntityField,
  type EntityIndexSpec,
  type StorageMode,
  collectionNameForDatatype,
  uniqueIndexName,
} from './internal';
import {
  FIELDS_COLLECTION,
  isKebabCaseKey,
  normalizeKeyLower,
} from '../fields/internal';
import { MongoActionError } from '../../lib/errors/MongoActionError';

@Injectable()
export class DatatypesService {
  constructor(private readonly mongo: MongodbService) {}

  /* =========================
   *       Public API
   * ========================= */

  /** List all datatypes (drafts only at Stage 2A). */
  public async list(dbName?: string): Promise<ReadonlyArray<DataTypeDoc>> {
    try {
      const coll = await this.getDatatypesCollection(dbName);
      const docs = await coll.find({}).toArray();
      return docs;
    } catch (err) {
      throw MongoActionError.wrap(err, {
        operation: 'datatypes.list',
        dbName,
      });
    }
  }

  /** Get a datatype by kebab-case key. */
  public async getByKey(
    key: string,
    dbName?: string,
  ): Promise<DataTypeDoc | null> {
    if (!isKebabCaseKey(key)) {
      throw new MongoActionError('Datatype key must be kebab-case', {
        operation: 'datatypes.getByKey',
        argsPreview: { key },
        dbName,
      });
    }
    const keyLower = normalizeKeyLower(key);

    try {
      const coll = await this.getDatatypesCollection(dbName);
      const doc = await coll.findOne({ keyLower });
      return doc;
    } catch (err) {
      throw MongoActionError.wrap(err, {
        operation: 'datatypes.getByKey',
        argsPreview: { key },
        dbName,
      });
    }
  }

  /**
   * Create a **draft** datatype definition.
   * - Validates field references exist.
   * - Enforces rule: `unique && array` is invalid (Stage 2A).
   * - If storage.mode === 'perType', ensures backing collection exists and
   *   creates unique indexes for composed fields that specify `unique: true`.
   */
  public async create(
    input: {
      key: string;
      label: string;
      fields?: ReadonlyArray<EntityField>;
      storage?: { mode?: StorageMode };
      indexes?: ReadonlyArray<EntityIndexSpec>;
    },
    dbName?: string,
  ): Promise<DataTypeDoc> {
    const { key, label } = input;

    if (!isKebabCaseKey(key)) {
      throw new MongoActionError('Datatype key must be kebab-case', {
        operation: 'datatypes.create',
        argsPreview: { key },
        dbName,
      });
    }

    const keyLower = normalizeKeyLower(key);
    const fields = input.fields ?? [];
    const storageMode: StorageMode = input.storage?.mode ?? 'single';
    const now = new Date();

    try {
      const db = await this.mongo.getDb(dbName);
      const coll = await this.getDatatypesCollection(dbName);

      // Ensure unique index on keyLower exists
      await coll.createIndex(
        { keyLower: 1 },
        { unique: true, name: 'uniq_datatypes_keyLower' },
      );

      // Uniqueness check
      const existing = await coll.findOne({ keyLower });
      if (existing) {
        throw new MongoActionError('Datatype key already exists', {
          operation: 'datatypes.create',
          argsPreview: { key },
          dbName,
        });
      }

      // Validate field composition
      await this.validateFieldsExist(db, fields, dbName);
      this.enforceCompositionRules(key, fields);

      // Prepare doc
      const doc: DataTypeDocBase = {
        key,
        keyLower,
        label,
        version: 1,
        status: 'draft',
        fields,
        indexes: input.indexes,
        policies: undefined,
        hooks: undefined,
        storage: { mode: storageMode },
        locked: false,
        createdAt: now,
        updatedAt: now,
      };

      // Insert definition
      const res = await coll.insertOne(doc);

      // Storage-specific: perType → ensure collection + field indexes
      if (storageMode === 'perType') {
        const entityCollName = collectionNameForDatatype(key);
        await this.ensureCollection(db, entityCollName);
        await this.syncPerTypeUniqueIndexes(db, key, fields);
      }

      const created = await coll.findOne({ _id: res.insertedId });
      if (!created) {
        throw new MongoActionError('Failed to load created datatype', {
          operation: 'datatypes.create',
          argsPreview: { key },
          dbName,
        });
      }
      return created;
    } catch (err) {
      throw MongoActionError.wrap(err, {
        operation: 'datatypes.create',
        argsPreview: {
          key,
          label,
          fields: summarize(fields),
          storage: storageMode,
        },
        dbName,
      });
    }
  }

  /** Add a field to a draft datatype. */
  public async addField(
    datatypeKey: string,
    field: EntityField,
    dbName?: string,
  ): Promise<DataTypeDoc> {
    if (!isKebabCaseKey(datatypeKey)) {
      throw new MongoActionError('Datatype key must be kebab-case', {
        operation: 'datatypes.addField',
        argsPreview: { datatypeKey },
        dbName,
      });
    }
    const keyLower = normalizeKeyLower(datatypeKey);

    try {
      const db = await this.mongo.getDb(dbName);
      const coll = await this.getDatatypesCollection(dbName);

      const current = await coll.findOne({ keyLower });
      if (!current) {
        throw new MongoActionError('Datatype not found', {
          operation: 'datatypes.addField',
          argsPreview: { datatypeKey },
          dbName,
        });
      }
      if (current.status !== 'draft') {
        throw new MongoActionError('Only draft datatypes can be modified', {
          operation: 'datatypes.addField',
          argsPreview: { datatypeKey },
          dbName,
        });
      }

      // Validate
      await this.validateFieldsExist(db, [field], dbName);
      this.enforceCompositionRules(current.key, [field]);

      // Append
      const updatedFields = [...current.fields, field];
      const setUpdate: Record<string, unknown> = {
        fields: updatedFields,
        updatedAt: new Date(),
      };
      await coll.updateOne({ _id: current._id }, { $set: setUpdate });

      // Index management for perType + unique
      if (
        current.storage.mode === 'perType' &&
        field.unique === true &&
        field.array === false
      ) {
        await this.createPerTypeUniqueIndex(db, current.key, field.fieldKey);
      }

      const updated = await coll.findOne({ _id: current._id });
      if (!updated) {
        throw new MongoActionError('Failed to load updated datatype', {
          operation: 'datatypes.addField',
          argsPreview: { datatypeKey },
          dbName,
        });
      }
      return updated;
    } catch (err) {
      throw MongoActionError.wrap(err, {
        operation: 'datatypes.addField',
        argsPreview: { datatypeKey, field: summarize(field) },
        dbName,
      });
    }
  }

  /**
   * Update a field within a draft datatype.
   * - Forbids changing `fieldKey` in Stage 2A.
   * - Handles unique toggle for perType storage (create/drop index).
   */
  public async updateField(
    datatypeKey: string,
    fieldKey: string,
    patch: Partial<EntityField>,
    dbName?: string,
  ): Promise<DataTypeDoc> {
    if (!isKebabCaseKey(datatypeKey)) {
      throw new MongoActionError('Datatype key must be kebab-case', {
        operation: 'datatypes.updateField',
        argsPreview: { datatypeKey },
        dbName,
      });
    }
    if (!isKebabCaseKey(fieldKey)) {
      throw new MongoActionError('Field key must be kebab-case', {
        operation: 'datatypes.updateField',
        argsPreview: { fieldKey },
        dbName,
      });
    }

    try {
      const db = await this.mongo.getDb(dbName);
      const coll = await this.getDatatypesCollection(dbName);
      const keyLower = normalizeKeyLower(datatypeKey);

      const current = await coll.findOne({ keyLower });
      if (!current) {
        throw new MongoActionError('Datatype not found', {
          operation: 'datatypes.updateField',
          argsPreview: { datatypeKey },
          dbName,
        });
      }
      if (current.status !== 'draft') {
        throw new MongoActionError('Only draft datatypes can be modified', {
          operation: 'datatypes.updateField',
          argsPreview: { datatypeKey },
          dbName,
        });
      }

      const idx = current.fields.findIndex(
        (f) => normalizeKeyLower(f.fieldKey) === normalizeKeyLower(fieldKey),
      );
      if (idx === -1) {
        throw new MongoActionError('Field not found in datatype', {
          operation: 'datatypes.updateField',
          argsPreview: { datatypeKey, fieldKey },
          dbName,
        });
      }

      // Forbid renaming fieldKey at Stage 2A
      if (
        patch.fieldKey &&
        normalizeKeyLower(patch.fieldKey) !== normalizeKeyLower(fieldKey)
      ) {
        throw new MongoActionError(
          'Renaming fieldKey is not allowed in this stage',
          {
            operation: 'datatypes.updateField',
            argsPreview: { patch: summarize(patch) },
            dbName,
          },
        );
      }

      const original = current.fields[idx];
      const merged: EntityField = {
        fieldKey: original.fieldKey,
        required: patch.required ?? original.required,
        array: patch.array ?? original.array,
        unique: patch.unique ?? original.unique,
        constraints: patch.constraints ?? original.constraints,
        order: patch.order ?? original.order,
      };

      // Validate composition rule: unique && array forbidden
      this.enforceCompositionRules(current.key, [merged]);

      // Persist
      const newFields = current.fields.slice();
      newFields[idx] = merged;

      const setUpdate: Record<string, unknown> = {
        fields: newFields,
        updatedAt: new Date(),
      };
      await coll.updateOne({ _id: current._id }, { $set: setUpdate });

      // Index toggle for perType
      if (current.storage.mode === 'perType') {
        const wasUnique = original.unique === true && original.array === false;
        const nowUnique = merged.unique === true && merged.array === false;

        if (!wasUnique && nowUnique) {
          await this.createPerTypeUniqueIndex(
            db,
            current.key,
            original.fieldKey,
          );
        } else if (wasUnique && !nowUnique) {
          await this.dropPerTypeUniqueIndex(db, current.key, original.fieldKey);
        }
      }

      const updated = await coll.findOne({ _id: current._id });
      if (!updated) {
        throw new MongoActionError('Failed to load updated datatype', {
          operation: 'datatypes.updateField',
          argsPreview: { datatypeKey, fieldKey },
          dbName,
        });
      }
      return updated;
    } catch (err) {
      throw MongoActionError.wrap(err, {
        operation: 'datatypes.updateField',
        argsPreview: { datatypeKey, fieldKey, patch: summarize(patch) },
        dbName,
      });
    }
  }

  /** Remove a field from a draft datatype (drops unique index if needed for perType). */
  public async removeField(
    datatypeKey: string,
    fieldKey: string,
    dbName?: string,
  ): Promise<DataTypeDoc> {
    if (!isKebabCaseKey(datatypeKey)) {
      throw new MongoActionError('Datatype key must be kebab-case', {
        operation: 'datatypes.removeField',
        argsPreview: { datatypeKey },
        dbName,
      });
    }
    if (!isKebabCaseKey(fieldKey)) {
      throw new MongoActionError('Field key must be kebab-case', {
        operation: 'datatypes.removeField',
        argsPreview: { fieldKey },
        dbName,
      });
    }

    try {
      const db = await this.mongo.getDb(dbName);
      const coll = await this.getDatatypesCollection(dbName);
      const keyLower = normalizeKeyLower(datatypeKey);

      const current = await coll.findOne({ keyLower });
      if (!current) {
        throw new MongoActionError('Datatype not found', {
          operation: 'datatypes.removeField',
          argsPreview: { datatypeKey },
          dbName,
        });
      }
      if (current.status !== 'draft') {
        throw new MongoActionError('Only draft datatypes can be modified', {
          operation: 'datatypes.removeField',
          argsPreview: { datatypeKey },
          dbName,
        });
      }

      const idx = current.fields.findIndex(
        (f) => normalizeKeyLower(f.fieldKey) === normalizeKeyLower(fieldKey),
      );
      if (idx === -1) {
        throw new MongoActionError('Field not found in datatype', {
          operation: 'datatypes.removeField',
          argsPreview: { datatypeKey, fieldKey },
          dbName,
        });
      }

      const removed = current.fields[idx];

      // Drop index if needed (perType + unique)
      if (
        current.storage.mode === 'perType' &&
        removed.unique === true &&
        removed.array === false
      ) {
        await this.dropPerTypeUniqueIndex(db, current.key, removed.fieldKey);
      }

      const newFields = current.fields
        .slice(0, idx)
        .concat(current.fields.slice(idx + 1));
      const setUpdate: Record<string, unknown> = {
        fields: newFields,
        updatedAt: new Date(),
      };
      await coll.updateOne({ _id: current._id }, { $set: setUpdate });

      const updated = await coll.findOne({ _id: current._id });
      if (!updated) {
        throw new MongoActionError('Failed to load updated datatype', {
          operation: 'datatypes.removeField',
          argsPreview: { datatypeKey, fieldKey },
          dbName,
        });
      }
      return updated;
    } catch (err) {
      throw MongoActionError.wrap(err, {
        operation: 'datatypes.removeField',
        argsPreview: { datatypeKey, fieldKey },
        dbName,
      });
    }
  }

  /* =========================
   *         Internals
   * ========================= */

  private async getDatatypesCollection(
    dbName?: string,
  ): Promise<Collection<DataTypeDocBase>> {
    const db = await this.mongo.getDb(dbName);
    const coll: Collection<DataTypeDocBase> =
      db.collection<DataTypeDocBase>(DATATYPES_COLLECTION);
    return coll;
  }

  private async getFieldsCollection(
    dbName?: string,
  ): Promise<Collection<{ keyLower: string }>> {
    const db = await this.mongo.getDb(dbName);
    // We only need keyLower existence; keep a minimal projection type.
    const coll: Collection<{ keyLower: string }> = db.collection<{
      keyLower: string;
    }>(FIELDS_COLLECTION);
    return coll;
  }

  /** Ensure referenced fields exist in `fields` collection. */
  private async validateFieldsExist(
    db: Db,
    fields: ReadonlyArray<EntityField>,
    dbName?: string,
  ): Promise<void> {
    if (fields.length === 0) return;
    const coll = db.collection<{ keyLower: string }>(FIELDS_COLLECTION);
    for (const f of fields) {
      if (!isKebabCaseKey(f.fieldKey)) {
        throw new MongoActionError('field.fieldKey must be kebab-case', {
          operation: 'datatypes.validateFieldsExist',
          argsPreview: { fieldKey: f.fieldKey },
          dbName,
        });
      }
      const keyLower = normalizeKeyLower(f.fieldKey);
      const exists = await coll.findOne({ keyLower });
      if (!exists) {
        throw new MongoActionError('Referenced fieldKey does not exist', {
          operation: 'datatypes.validateFieldsExist',
          argsPreview: { fieldKey: f.fieldKey },
          dbName,
        });
      }
    }
  }

  /** Composition rule: forbid unique && array together (Stage 2A). */
  private enforceCompositionRules(
    datatypeKey: string,
    fields: ReadonlyArray<EntityField>,
  ): void {
    for (const f of fields) {
      if (f.unique === true && f.array === true) {
        throw new MongoActionError(
          'A field cannot be both unique and array in this stage',
          {
            operation: 'datatypes.compositionRules',
            argsPreview: { datatypeKey, fieldKey: f.fieldKey },
          },
        );
      }
    }
  }

  /** Ensure a collection exists (idempotent). */
  private async ensureCollection(db: Db, name: string): Promise<void> {
    const existing = await db.listCollections({ name }).toArray();
    if (existing.length === 0) {
      await db.createCollection(name);
    }
  }

  /** Create all per-type unique indexes for the given composition (idempotent). */
  private async syncPerTypeUniqueIndexes(
    db: Db,
    datatypeKey: string,
    fields: ReadonlyArray<EntityField>,
  ): Promise<void> {
    for (const f of fields) {
      if (f.unique === true && f.array === false) {
        await this.createPerTypeUniqueIndex(db, datatypeKey, f.fieldKey);
      }
    }
  }

  /** Create a single per-type unique index (idempotent). */
  private async createPerTypeUniqueIndex(
    db: Db,
    datatypeKey: string,
    fieldKey: string,
  ): Promise<void> {
    const collName = collectionNameForDatatype(datatypeKey);
    await this.ensureCollection(db, collName);
    const coll = db.collection(collName);
    const name = uniqueIndexName(datatypeKey, fieldKey);
    await coll.createIndex({ [fieldKey]: 1 }, { unique: true, name });
  }

  /** Drop a single per-type unique index if it exists. */
  private async dropPerTypeUniqueIndex(
    db: Db,
    datatypeKey: string,
    fieldKey: string,
  ): Promise<void> {
    const collName = collectionNameForDatatype(datatypeKey);
    const coll = db.collection(collName);
    const name = uniqueIndexName(datatypeKey, fieldKey);

    // Make array type explicit to avoid 'any' member access
    type IndexDoc = { readonly name?: unknown };
    const idxList = (await coll
      .listIndexes()
      .toArray()) as ReadonlyArray<IndexDoc>;
    const has = idxList.some(
      (i) => typeof i.name === 'string' && i.name === name,
    );

    if (has) {
      await coll.dropIndex(name);
    }
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
