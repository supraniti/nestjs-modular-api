import { DatatypesService } from '../datatypes.service';
import type { Db, ObjectId, WithId } from 'mongodb';
import { ObjectId as Oid } from 'mongodb';
import { collectionNameForDatatype, uniqueIndexName } from '../internal';
import { MongoActionError } from '../../../lib/errors/MongoActionError';
import { FIELDS_COLLECTION } from '../../fields/internal';

// ---------- In-memory typed fakes ----------

type IndexSpec = {
  readonly name: string;
  readonly unique?: boolean;
  readonly keys: Record<string, 1 | -1 | 'text'>;
};

class InMemoryCollection<T extends Record<string, unknown>> {
  public readonly name: string;
  private docs: WithId<T>[] = [];
  private indexes: IndexSpec[] = [];

  constructor(name: string, initial?: ReadonlyArray<WithId<T>>) {
    this.name = name;
    if (initial) this.docs = initial.slice();
  }

  public createIndex(
    keys: Record<string, 1 | -1 | 'text'>,
    options?: { unique?: boolean; name?: string },
  ): string {
    const name = options?.name ?? `idx_${this.indexes.length + 1}`;
    const existing = this.indexes.find((i) => i.name === name);
    if (!existing) this.indexes.push({ name, unique: options?.unique, keys });
    return name;
  }

  public find(_filter: Record<string, unknown>) {
    void _filter;
    const toArray = (): WithId<T>[] => this.docs.slice();
    return { toArray };
  }

  public findOne(filter: Partial<WithId<T>>): WithId<T> | null {
    if ('_id' in filter) {
      const id = filter._id as ObjectId;
      return this.docs.find((d) => (d._id as ObjectId).equals(id)) ?? null;
    }
    if ('keyLower' in (filter as Record<string, unknown>)) {
      const kl = String((filter as Record<string, unknown>).keyLower);
      return this.docs.find((d) => d.keyLower === kl) ?? null;
    }
    return (
      this.docs.find((d) =>
        Object.entries(filter as Record<string, unknown>).every(
          ([k, v]) => (d as Record<string, unknown>)[k] === v,
        ),
      ) ?? null
    );
  }

  public insertOne(doc: T): { acknowledged: true; insertedId: ObjectId } {
    const _id = new Oid();
    const withId = { _id, ...doc } as WithId<T>;
    this.docs.push(withId);
    return { acknowledged: true, insertedId: _id };
  }

  public updateOne(
    filter: Partial<WithId<T>>,
    update: { $set?: Partial<T> },
  ): { acknowledged: true; matchedCount: number; modifiedCount: number } {
    const doc = this.findOne(filter);
    if (!doc) return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
    const idx = this.docs.findIndex((d) =>
      (d._id as ObjectId).equals(doc._id as ObjectId),
    );
    const next = {
      ...doc,
      ...update.$set,
    } as WithId<T>;
    this.docs[idx] = next;
    return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
  }

  public listIndexes() {
    const toArray = (): IndexSpec[] => this.indexes.slice();
    return { toArray };
  }

  public dropIndex(name: string): void {
    this.indexes = this.indexes.filter((i) => i.name !== name);
  }

  public getIndexNames(): string[] {
    return this.indexes.map((i) => i.name);
  }
}

class InMemoryDb {
  [key: string]: any;
  private readonly map = new Map<
    string,
    InMemoryCollection<Record<string, unknown>>
  >();

  public collection<T extends Record<string, unknown>>(
    name: string,
  ): InMemoryCollection<T> {
    if (!this.map.has(name)) this.map.set(name, new InMemoryCollection(name));
    return this.map.get(name)! as InMemoryCollection<T>;
  }

  public listCollections(filter: { name?: string }) {
    const toArray = (): Array<{ name: string }> => {
      const names = Array.from(this.map.keys());
      const items = names.map((n) => ({ name: n }));
      if (filter?.name) return items.filter((x) => x.name === filter.name);
      return items;
    };
    return { toArray };
  }

  public createCollection(
    name: string,
  ): InMemoryCollection<Record<string, unknown>> {
    const coll = new InMemoryCollection<Record<string, unknown>>(name);
    this.map.set(name, coll);
    return coll;
  }
}

// ---------- Tests ----------

describe('DatatypesService (unit, typed fakes)', () => {
  let svc: DatatypesService;
  let db: InMemoryDb;

  function seedFields(keys: string[]): void {
    const coll = db.collection<{ keyLower: string }>(FIELDS_COLLECTION);
    for (const k of keys) {
      void coll.insertOne({ keyLower: k.toLowerCase() });
    }
  }

  beforeEach(() => {
    db = new InMemoryDb();
    const fakeMongo = {
      getDb: () => Promise.resolve(db as unknown as Db),
    } as unknown as import('../../mongodb/mongodb.service').MongodbService;
    svc = new DatatypesService(fakeMongo);
    seedFields(['string', 'number', 'boolean']);
  });

  it('creates a draft datatype with storage=single', async () => {
    const created = await svc.create({
      key: 'article',
      label: 'Article',
      fields: [
        { fieldKey: 'string', required: true, array: false, unique: true },
      ],
      storage: { mode: 'single' },
    });

    expect(created.key).toBe('article');
    expect(created.status).toBe('draft');
    expect(created.storage.mode).toBe('single');
    expect(created.fields).toHaveLength(1);
  });

  it('rejects a field that is both unique and array', async () => {
    await expect(
      svc.create({
        key: 'inv',
        label: 'Inventory',
        fields: [
          { fieldKey: 'number', required: true, array: true, unique: true },
        ],
        storage: { mode: 'single' },
      }),
    ).rejects.toBeInstanceOf(MongoActionError);
  });

  it('perType: creates backing collection and unique index on addField', async () => {
    await svc.create({
      key: 'product',
      label: 'Product',
      fields: [],
      storage: { mode: 'perType' },
    });

    const updated = await svc.addField('product', {
      fieldKey: 'string',
      required: true,
      array: false,
      unique: true,
    });

    expect(updated.fields).toHaveLength(1);

    const entityColl = db.collection(collectionNameForDatatype('product'));
    const idxNames = entityColl.getIndexNames();
    expect(idxNames).toContain(uniqueIndexName('product', 'string'));
  });

  it('perType: updateField toggles unique to create/drop indexes', async () => {
    await svc.create({
      key: 'user',
      label: 'User',
      fields: [
        { fieldKey: 'string', required: true, array: false, unique: false },
      ],
      storage: { mode: 'perType' },
    });

    await svc.updateField('user', 'string', { unique: true });
    let idxNames = db
      .collection(collectionNameForDatatype('user'))
      .getIndexNames();
    expect(idxNames).toContain(uniqueIndexName('user', 'string'));

    await svc.updateField('user', 'string', { unique: false });
    idxNames = db.collection(collectionNameForDatatype('user')).getIndexNames();
    expect(idxNames).not.toContain(uniqueIndexName('user', 'string'));
  });

  it('removeField drops unique index if present (perType)', async () => {
    await svc.create({
      key: 'tag',
      label: 'Tag',
      fields: [
        { fieldKey: 'string', required: true, array: false, unique: true },
      ],
      storage: { mode: 'perType' },
    });

    await svc.removeField('tag', 'string');
    const idxNames = db
      .collection(collectionNameForDatatype('tag'))
      .getIndexNames();
    expect(idxNames).not.toContain(uniqueIndexName('tag', 'string'));
  });
});
