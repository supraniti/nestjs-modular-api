import { Test } from '@nestjs/testing';
import { DatatypesService } from '../datatypes.service';
import { MongodbService } from '../../mongodb/mongodb.service';
import {
  DATATYPES_COLLECTION,
  collectionNameForDatatype,
  uniqueIndexName,
  type DataTypeDoc,
} from '../internal';
import { ObjectId } from 'mongodb';
import { AppError } from '../../../lib/errors/AppError';

/* Minimal in-memory stubs with just the API surface we need */

type IndexSpec = { name?: string; unique?: boolean };

class InMemEntityCollection {
  public readonly indexes = new Set<string>();

  public async createIndex(
    _keys: Record<string, 1 | -1>,
    options?: IndexSpec,
  ): Promise<string> {
    // satisfy require-await
    await Promise.resolve();
    const name = options?.name ?? `idx_${Date.now()}`;
    this.indexes.add(name);
    return name;
  }

  public async dropIndex(name: string): Promise<void> {
    await Promise.resolve();
    this.indexes.delete(name);
  }
}

class InMemDatatypesCollection {
  constructor(private doc: DataTypeDoc) {}

  public async findOne(
    filter: Record<string, unknown>,
  ): Promise<DataTypeDoc | null> {
    await Promise.resolve();
    if ('_id' in filter && String(filter._id) === String(this.doc._id))
      return this.doc;
    if ('keyLower' in filter && filter.keyLower === this.doc.keyLower)
      return this.doc;
    return null;
  }

  public async updateOne(
    filter: Record<string, unknown>,
    update: { $set?: Partial<DataTypeDoc> },
  ): Promise<void> {
    await Promise.resolve();
    const curr = await this.findOne(filter);
    if (curr && update.$set) {
      this.doc = {
        ...curr,
        ...update.$set,
        updatedAt: new Date(),
      } as DataTypeDoc;
    }
  }

  public find(filter: unknown) {
    // consume the argument to keep eslint happy
    void filter;
    return {
      toArray: async (): Promise<DataTypeDoc[]> => {
        await Promise.resolve();
        return [this.doc];
      },
    };
  }

  public get current(): DataTypeDoc {
    return this.doc;
  }
}

class InMemDb {
  private readonly entities = new Map<string, InMemEntityCollection>();
  private readonly collections = new Set<string>();
  private readonly datatypes: InMemDatatypesCollection;

  constructor(doc: DataTypeDoc) {
    this.datatypes = new InMemDatatypesCollection(doc);
    this.collections.add(DATATYPES_COLLECTION);
  }

  public collection(name: string): unknown {
    if (name === DATATYPES_COLLECTION) return this.datatypes;
    let coll = this.entities.get(name);
    if (!coll) {
      coll = new InMemEntityCollection();
      this.entities.set(name, coll);
    }
    return coll;
  }

  public listCollections(filter: { name?: string }) {
    const arr = Array.from(this.collections).map((n) => ({ name: n }));
    const filtered = filter?.name
      ? arr.filter((c) => c.name === filter.name)
      : arr;
    return {
      toArray: async (): Promise<{ name: string }[]> => {
        await Promise.resolve();
        return filtered;
      },
    };
  }

  public async createCollection(name: string): Promise<void> {
    await Promise.resolve();
    this.collections.add(name);
    if (!this.entities.has(name))
      this.entities.set(name, new InMemEntityCollection());
  }

  /* helpers for assertions */
  public entity(name: string): InMemEntityCollection {
    const coll = this.entities.get(name);
    if (!coll) throw new Error(`entity ${name} not created`);
    return coll;
  }

  public datatypesColl(): InMemDatatypesCollection {
    return this.datatypes;
  }
}

function seedDocDraftPerType(): DataTypeDoc {
  const now = new Date();
  return {
    _id: new ObjectId(),
    key: 'publish_case',
    keyLower: 'publish_case',
    label: 'Publish Case',
    version: 1,
    status: 'draft',
    storage: { mode: 'perType' },
    fields: [
      {
        fieldKey: 'sku',
        required: false,
        array: false,
        unique: true,
        order: 0,
        constraints: undefined,
      },
      {
        fieldKey: 'tags',
        required: false,
        array: true,
        unique: false,
        order: 1,
        constraints: undefined,
      },
    ],
    indexes: [],
    locked: false,
    createdAt: now,
    updatedAt: now,
  };
}

describe('DatatypesService – publish/unpublish (in-memory)', () => {
  it('publish: flips to published, creates per-type collection + unique indexes; unpublish flips back to draft', async () => {
    const doc = seedDocDraftPerType();
    const db = new InMemDb(doc);

    const mongoMock = {
      getDb: async (): Promise<unknown> => {
        await Promise.resolve();
        return db as unknown;
      },
    } as unknown as MongodbService;

    const modRef = await Test.createTestingModule({
      providers: [
        DatatypesService,
        { provide: MongodbService, useValue: mongoMock },
      ],
    }).compile();

    const svc = modRef.get(DatatypesService);

    // publish
    const published = await svc.publish('publish_case');
    expect(published.status).toBe('published');

    // entity collection + unique index created
    const entityName = collectionNameForDatatype('publish_case');
    const idxName = uniqueIndexName('publish_case', 'sku');
    expect(db.entity(entityName).indexes.has(idxName)).toBe(true);

    // unpublish
    const back = await svc.unpublish('publish_case');
    expect(back.status).toBe('draft');
  });

  it('publish throws AppError when not draft', async () => {
    const doc = { ...seedDocDraftPerType(), status: 'published' as const };
    const db = new InMemDb(doc);

    const mongoMock = {
      getDb: async (): Promise<unknown> => {
        await Promise.resolve();
        return db as unknown;
      },
    } as unknown as MongodbService;

    const modRef = await Test.createTestingModule({
      providers: [
        DatatypesService,
        { provide: MongodbService, useValue: mongoMock },
      ],
    }).compile();

    const svc = modRef.get(DatatypesService);

    await expect(svc.publish('publish_case')).rejects.toBeInstanceOf(AppError);
  });
});
