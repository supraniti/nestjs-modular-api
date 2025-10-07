import { Injectable } from '@nestjs/common';
import type {
  Collection,
  CreateIndexesOptions,
  Db,
  Filter,
  ObjectId,
} from 'mongodb';
import { MongodbService } from '../mongodb/mongodb.service';
import { MongoActionError } from '../../lib/errors/MongoActionError';
import {
  DATATYPES_COLLECTION,
  type DataTypeDoc,
  type EntityField,
  type EntityIndexSpec,
  collectionNameForDatatype,
  uniqueIndexName,
} from './internal';
import { FIELDS_COLLECTION } from '../fields/internal';

type CreateInput = {
  readonly key: string;
  readonly label: string;
  readonly fields?: ReadonlyArray<
    Pick<
      EntityField,
      'fieldKey' | 'required' | 'array' | 'unique' | 'order' | 'constraints'
    >
  >;
  readonly storage?: { readonly mode: 'single' | 'perType' };
  readonly indexes?: ReadonlyArray<EntityIndexSpec>;
};

type UpdateFieldPatch = Partial<
  Pick<EntityField, 'required' | 'array' | 'unique' | 'order' | 'constraints'>
>;

@Injectable()
export class DatatypesService {
  constructor(private readonly mongo: MongodbService) {}

  /* ─────────────────────────── Public API ─────────────────────────── */

  public async list(dbName?: string): Promise<ReadonlyArray<DataTypeDoc>> {
    try {
      const db = await this.mongo.getDb(dbName);
      const docs = await this.coll(db).find({}).toArray();
      return docs as ReadonlyArray<DataTypeDoc>;
    } catch (err: unknown) {
      const cause = err instanceof Error ? err.message : undefined;
      throw MongoActionError.wrap(
        'Failed to list datatypes',
        { operation: 'datatypes.list', dbName },
        cause,
      );
    }
  }

  public async getByKey(
    key: string,
    dbName?: string,
  ): Promise<DataTypeDoc | null> {
    const keyLower = key.trim().toLowerCase();
    try {
      const db = await this.mongo.getDb(dbName);
      const filter: Filter<DataTypeDoc> = { keyLower };
      const doc = await this.coll(db).findOne(filter);
      return (doc as DataTypeDoc | null) ?? null;
    } catch (err: unknown) {
      const cause = err instanceof Error ? err.message : undefined;
      throw MongoActionError.wrap(
        'Failed to get datatype',
        { operation: 'datatypes.getByKey', dbName, argsPreview: { key } },
        cause,
      );
    }
  }

  public async create(
    input: CreateInput,
    dbName?: string,
  ): Promise<DataTypeDoc> {
    const key = input.key.trim();
    const keyLower = key.toLowerCase();

    this.ensureFieldsWellFormed(input.fields ?? []);
    await this.ensureFieldKeysExist(input.fields ?? [], dbName);

    try {
      const db = await this.mongo.getDb(dbName);
      const coll = this.coll(db);

      const now = new Date();
      const toInsert: Omit<DataTypeDoc, '_id'> = {
        key,
        keyLower,
        label: input.label,
        version: 1,
        status: 'draft',
        fields: (input.fields ?? []).map((f) => ({ ...f })),
        storage: { mode: input.storage?.mode ?? 'single' },
        indexes:
          input.indexes?.map((i) => ({
            keys: { ...i.keys },
            options: i.options ? { ...i.options } : undefined,
          })) ?? [],
        locked: false,
        createdAt: now,
        updatedAt: now,
      };

      const ins = await coll.insertOne(toInsert as unknown as DataTypeDoc);
      const created = (await coll.findOne({
        _id: ins.insertedId as unknown as ObjectId,
      })) as DataTypeDoc | null;
      if (!created) {
        throw new Error('Inserted datatype not found');
      }

      if (created.storage.mode === 'perType') {
        await this.ensurePerTypeCollectionAndUniqueIndexes(db, created);
      }

      return created;
    } catch (err: unknown) {
      const cause = err instanceof Error ? err.message : undefined;
      throw MongoActionError.wrap(
        'Failed to create datatype',
        { operation: 'datatypes.create', dbName, argsPreview: { key } },
        cause,
      );
    }
  }

  public async addField(
    key: string,
    field: Pick<
      EntityField,
      'fieldKey' | 'required' | 'array' | 'unique' | 'order' | 'constraints'
    >,
    dbName?: string,
  ): Promise<DataTypeDoc> {
    this.ensureFieldsWellFormed([field]);
    await this.ensureFieldKeysExist([field], dbName);

    try {
      const db = await this.mongo.getDb(dbName);
      const doc = await this.mustGetByKey(db, key);
      this.ensureDraft(doc, 'addField');

      if (doc.fields.some((f) => f.fieldKey === field.fieldKey)) {
        throw MongoActionError.wrap('Field already exists on datatype', {
          operation: 'datatypes.addField',
          dbName,
          argsPreview: { key, fieldKey: field.fieldKey },
        });
      }

      const nextFields = [...doc.fields, { ...field }];
      await this.coll(db).updateOne(
        { _id: doc._id },
        { $set: { fields: nextFields, updatedAt: new Date() } },
      );

      if (
        doc.storage.mode === 'perType' &&
        field.unique === true &&
        field.array !== true
      ) {
        const entity = db.collection(collectionNameForDatatype(doc.key));
        const idxName = uniqueIndexName(doc.key, field.fieldKey);
        await entity.createIndex(
          { [field.fieldKey]: 1 },
          { unique: true, name: idxName },
        );
      }

      const updated = await this.coll(db).findOne({ _id: doc._id });
      return updated as DataTypeDoc;
    } catch (err: unknown) {
      const cause = err instanceof Error ? err.message : undefined;
      throw MongoActionError.wrap(
        'Failed to add field to datatype',
        {
          operation: 'datatypes.addField',
          dbName,
          argsPreview: { key, fieldKey: field.fieldKey },
        },
        cause,
      );
    }
  }

  public async updateField(
    key: string,
    fieldKey: string,
    patch: UpdateFieldPatch,
    dbName?: string,
  ): Promise<DataTypeDoc> {
    if (patch.array === true && patch.unique === true) {
      throw MongoActionError.wrap('A field cannot be both unique and array', {
        operation: 'datatypes.updateField.validate',
        dbName,
        argsPreview: { key, fieldKey },
      });
    }

    try {
      const db = await this.mongo.getDb(dbName);
      const doc = await this.mustGetByKey(db, key);
      this.ensureDraft(doc, 'updateField');

      const i = doc.fields.findIndex((f) => f.fieldKey === fieldKey);
      const current = i >= 0 ? doc.fields[i] : undefined;
      if (!current) {
        throw MongoActionError.wrap('Field not found on datatype', {
          operation: 'datatypes.updateField',
          dbName,
          argsPreview: { key, fieldKey },
        });
      }

      const merged: EntityField = { ...current, ...patch };
      this.ensureFieldsWellFormed([merged]);

      const nextFields = [...doc.fields];
      nextFields[i] = merged;

      await this.coll(db).updateOne(
        { _id: doc._id },
        { $set: { fields: nextFields, updatedAt: new Date() } },
      );

      if (doc.storage.mode === 'perType') {
        const entity = db.collection(collectionNameForDatatype(doc.key));
        const uniqueNow = merged.unique === true && merged.array !== true;
        const uniqueWas = current.unique === true && current.array !== true;
        const idxName = uniqueIndexName(doc.key, fieldKey);

        if (!uniqueWas && uniqueNow) {
          await entity.createIndex(
            { [fieldKey]: 1 },
            { unique: true, name: idxName },
          );
        } else if (uniqueWas && !uniqueNow) {
          try {
            await (
              entity as unknown as { dropIndex(name: string): Promise<void> }
            ).dropIndex(idxName);
          } catch {
            /* ignore */
          }
        }
      }

      const updated = await this.coll(db).findOne({ _id: doc._id });
      return updated as DataTypeDoc;
    } catch (err: unknown) {
      const cause = err instanceof Error ? err.message : undefined;
      throw MongoActionError.wrap(
        'Failed to update field on datatype',
        {
          operation: 'datatypes.updateField',
          dbName,
          argsPreview: { key, fieldKey },
        },
        cause,
      );
    }
  }

  public async removeField(
    key: string,
    fieldKey: string,
    dbName?: string,
  ): Promise<DataTypeDoc> {
    try {
      const db = await this.mongo.getDb(dbName);
      const doc = await this.mustGetByKey(db, key);
      this.ensureDraft(doc, 'removeField');

      if (!doc.fields.some((f) => f.fieldKey === fieldKey)) {
        throw MongoActionError.wrap('Field not found on datatype', {
          operation: 'datatypes.removeField',
          dbName,
          argsPreview: { key, fieldKey },
        });
      }

      const nextFields = doc.fields.filter((f) => f.fieldKey !== fieldKey);
      await this.coll(db).updateOne(
        { _id: doc._id },
        { $set: { fields: nextFields, updatedAt: new Date() } },
      );

      if (doc.storage.mode === 'perType') {
        const entity = db.collection(collectionNameForDatatype(doc.key));
        const idxName = uniqueIndexName(doc.key, fieldKey);
        try {
          await (
            entity as unknown as { dropIndex(name: string): Promise<void> }
          ).dropIndex(idxName);
        } catch {
          /* ignore */
        }
      }

      const updated = await this.coll(db).findOne({ _id: doc._id });
      return updated as DataTypeDoc;
    } catch (err: unknown) {
      const cause = err instanceof Error ? err.message : undefined;
      throw MongoActionError.wrap(
        'Failed to remove field from datatype',
        {
          operation: 'datatypes.removeField',
          dbName,
          argsPreview: { key, fieldKey },
        },
        cause,
      );
    }
  }

  /** Freeze composition, sync backing collection/indexes, and mark as published. */
  public async publish(key: string, dbName?: string): Promise<DataTypeDoc> {
    try {
      const db = await this.mongo.getDb(dbName);
      const doc = await this.mustGetByKey(db, key);

      if (doc.status !== 'draft') {
        throw MongoActionError.wrap('Only drafts can be published', {
          operation: 'datatypes.publish',
          dbName,
          argsPreview: { key, status: doc.status },
        });
      }

      if (doc.storage.mode === 'perType') {
        await this.ensurePerTypeCollectionAndUniqueIndexes(db, doc);
      }

      await this.coll(db).updateOne(
        { _id: doc._id },
        { $set: { status: 'published', updatedAt: new Date() } },
      );
      const updated = await this.coll(db).findOne({ _id: doc._id });
      return updated as DataTypeDoc;
    } catch (err: unknown) {
      const cause = err instanceof Error ? err.message : undefined;
      throw MongoActionError.wrap(
        'Failed to publish datatype',
        { operation: 'datatypes.publish', dbName, argsPreview: { key } },
        cause,
      );
    }
  }

  /** Mark as draft to allow editing again (dev-only for this stage). */
  public async unpublish(key: string, dbName?: string): Promise<DataTypeDoc> {
    try {
      const db = await this.mongo.getDb(dbName);
      const doc = await this.mustGetByKey(db, key);

      if (doc.status !== 'published') {
        throw MongoActionError.wrap(
          'Only published datatypes can be unpublished',
          {
            operation: 'datatypes.unpublish',
            dbName,
            argsPreview: { key, status: doc.status },
          },
        );
      }

      await this.coll(db).updateOne(
        { _id: doc._id },
        { $set: { status: 'draft', updatedAt: new Date() } },
      );
      const updated = await this.coll(db).findOne({ _id: doc._id });
      return updated as DataTypeDoc;
    } catch (err: unknown) {
      const cause = err instanceof Error ? err.message : undefined;
      throw MongoActionError.wrap(
        'Failed to unpublish datatype',
        { operation: 'datatypes.unpublish', dbName, argsPreview: { key } },
        cause,
      );
    }
  }

  /* ─────────────────────────── Internals ─────────────────────────── */

  private coll(db: Db): Collection<DataTypeDoc> {
    return db.collection<DataTypeDoc>(DATATYPES_COLLECTION);
  }

  private async mustGetByKey(db: Db, key: string): Promise<DataTypeDoc> {
    const keyLower = key.trim().toLowerCase();
    const filter: Filter<DataTypeDoc> = { keyLower };
    const doc = (await this.coll(db).findOne(filter)) as DataTypeDoc | null;
    if (!doc) {
      throw MongoActionError.wrap('Datatype not found', {
        operation: 'datatypes.mustGetByKey',
        argsPreview: { key },
      });
    }
    return doc;
  }

  private ensureDraft(
    doc: DataTypeDoc,
    action: 'addField' | 'updateField' | 'removeField',
  ): void {
    if (doc.status !== 'draft') {
      throw MongoActionError.wrap(`Cannot ${action} on a published datatype`, {
        operation: `datatypes.${action}`,
        argsPreview: { key: doc.key, status: doc.status },
      });
    }
  }

  private ensureFieldsWellFormed(
    fields: ReadonlyArray<
      Pick<EntityField, 'fieldKey' | 'required' | 'array' | 'unique'>
    >,
  ): void {
    for (const f of fields) {
      if (f.array === true && f.unique === true) {
        throw MongoActionError.wrap('A field cannot be both unique and array', {
          operation: 'datatypes.field.validate',
          argsPreview: { fieldKey: f.fieldKey },
        });
      }
    }
  }

  private async ensureFieldKeysExist(
    fields: ReadonlyArray<Pick<EntityField, 'fieldKey'>>,
    dbName?: string,
  ): Promise<void> {
    if (fields.length === 0) return;
    const keys = Array.from(
      new Set(fields.map((f) => f.fieldKey.toLowerCase())),
    );
    const db = await this.mongo.getDb(dbName);
    const coll = db.collection<{ keyLower: string }>(FIELDS_COLLECTION);

    const filter: Filter<{ keyLower: string }> = { keyLower: { $in: keys } };
    const docs = await coll.find(filter).toArray();
    const found = new Set(docs.map((d) => d.keyLower));
    const missing = keys.filter((k) => !found.has(k));
    if (missing.length > 0) {
      throw MongoActionError.wrap(`Unknown field keys: ${missing.join(', ')}`, {
        operation: 'datatypes.field.ensureKeys',
        dbName,
        argsPreview: { keys },
      });
    }
  }

  private async ensurePerTypeCollectionAndUniqueIndexes(
    db: Db,
    doc: DataTypeDoc,
  ): Promise<void> {
    const name = collectionNameForDatatype(doc.key);
    const existing = await db.listCollections({ name }).toArray();
    if (!existing.some((c) => c.name === name)) {
      await db.createCollection(name);
    }
    const entity = db.collection(name);

    // Unique indexes for fields
    for (const f of doc.fields) {
      if (f.unique === true && f.array !== true) {
        const idxName = uniqueIndexName(doc.key, f.fieldKey);
        await entity.createIndex(
          { [f.fieldKey]: 1 },
          { unique: true, name: idxName },
        );
      }
    }

    // Additional indexes from spec (best-effort)
    if (doc.indexes && doc.indexes.length > 0) {
      for (const spec of doc.indexes) {
        try {
          const opts: CreateIndexesOptions | undefined = spec.options as
            | CreateIndexesOptions
            | undefined;
          await entity.createIndex(spec.keys, opts);
        } catch {
          /* tolerate index creation hiccups at this stage */
        }
      }
    }
  }
}
