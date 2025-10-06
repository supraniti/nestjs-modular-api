import { FieldsService } from '../fields.service';
import type { Collection, WithId } from 'mongodb';
import { ObjectId } from 'mongodb';
import {
  type FieldDocBase,
  type FieldKind,
  normalizeKeyLower,
} from '../internal';
import { MongoActionError } from '../../../lib/errors/MongoActionError';

// Tiny typed in-memory collection mock for FieldDocBase
type UpdateDoc = { $set: Record<string, unknown> };
type IndexOpts = { unique?: boolean; name?: string };

class InMemoryFieldsCollection {
  private store = new Map<string, WithId<FieldDocBase>>(); // keyLower -> doc

  constructor(initial?: ReadonlyArray<WithId<FieldDocBase>>) {
    if (initial) {
      for (const d of initial) this.store.set(d.keyLower, d);
    }
  }

  public createIndex(
    _keys: Record<string, number>,
    _options?: IndexOpts,
  ): Promise<string> {
    void _keys;
    void _options;
    return Promise.resolve('mock_index');
  }

  public find(_filter: Record<string, unknown>) {
    void _filter;
    const toArray = (): Promise<WithId<FieldDocBase>[]> =>
      Promise.resolve(Array.from(this.store.values()));
    return { toArray };
  }

  public findOne(
    filter: Record<string, unknown>,
  ): Promise<WithId<FieldDocBase> | null> {
    if ('_id' in filter) {
      const id = filter._id as ObjectId;
      const docs = Array.from(this.store.values());
      return Promise.resolve(docs.find((d) => d._id.equals(id)) ?? null);
    }
    if ('keyLower' in filter) {
      const keyLower = String(filter.keyLower);
      return Promise.resolve(this.store.get(keyLower) ?? null);
    }
    return Promise.resolve(null);
  }

  public insertOne(
    doc: FieldDocBase,
  ): Promise<{ acknowledged: true; insertedId: ObjectId }> {
    const _id = new ObjectId();
    const withId: WithId<FieldDocBase> = { _id, ...doc };
    this.store.set(doc.keyLower, withId);
    return Promise.resolve({ acknowledged: true, insertedId: _id });
  }

  public async updateOne(
    filter: Record<string, unknown>,
    update: UpdateDoc,
  ): Promise<{
    acknowledged: true;
    matchedCount: number;
    modifiedCount: number;
  }> {
    const existing = await this.findOne(filter);
    if (!existing)
      return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
    const $set = update.$set ?? {};
    const merged: WithId<FieldDocBase> = {
      ...existing,
      ...($set as Partial<FieldDocBase>),
    };
    this.store.set(existing.keyLower, merged);
    return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
  }

  public async deleteOne(
    filter: Record<string, unknown>,
  ): Promise<{ acknowledged: true; deletedCount: number }> {
    const existing = await this.findOne(filter);
    if (!existing) return { acknowledged: true, deletedCount: 0 };
    this.store.delete(existing.keyLower);
    return { acknowledged: true, deletedCount: 1 };
  }
}

describe('FieldsService (unit, typed fakes)', () => {
  let service: FieldsService;

  // Helper to wire a fresh service with an in-memory collection
  async function withCollection(initial?: ReadonlyArray<WithId<FieldDocBase>>) {
    const fakeMongo =
      {} as unknown as import('../../mongodb/mongodb.service').MongodbService;
    service = new FieldsService(fakeMongo);
    const coll = new InMemoryFieldsCollection(
      initial,
    ) as unknown as Collection<FieldDocBase>;
    // Override the private method in a typed-safe-ish way

    jest
      .spyOn<any, any>(service as any, 'getCollection')
      .mockResolvedValue(coll);
    // Make it truly async to satisfy require-await when awaited by callers
    await Promise.resolve();
    return coll;
  }

  function mkDocBase(
    key: string,
    label: string,
    kind: FieldKind,
    locked: boolean,
    dates?: { createdAt?: Date; updatedAt?: Date },
  ): FieldDocBase {
    const now = new Date();
    return {
      key,
      keyLower: normalizeKeyLower(key),
      label,
      kind,
      locked,
      createdAt: dates?.createdAt ?? now,
      updatedAt: dates?.updatedAt ?? now,
    };
  }

  function mkDoc(
    key: string,
    label: string,
    kind: FieldKind,
    locked: boolean,
  ): WithId<FieldDocBase> {
    const base = mkDocBase(key, label, kind, locked);
    return { _id: new ObjectId(), ...base };
  }

  it('list returns all docs', async () => {
    const initial: WithId<FieldDocBase>[] = [
      mkDoc('string', 'String', { type: 'string' }, true),
      mkDoc('number', 'Number', { type: 'number' }, true),
    ];
    await withCollection(initial);

    const result = await service.list();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
    expect(result[0]?.key).toBeDefined();
  });

  it('create inserts a custom field and enforces unique key', async () => {
    const key = 'custom-field';
    await withCollection();

    const created = await service.create({
      key,
      label: 'Custom',
      kind: { type: 'string', constraints: { minLength: 1 } },
    });

    expect(created.key).toBe(key);
    expect(created.locked).toBe(false);

    // second create with same key should fail
    await expect(
      service.create({
        key,
        label: 'Dup',
        kind: { type: 'string' },
      }),
    ).rejects.toBeInstanceOf(MongoActionError);
  });

  it('getByKey validates kebab-case and finds by normalized key', async () => {
    const doc = mkDoc('title', 'Title', { type: 'string' }, true);
    await withCollection([doc]);

    await expect(service.getByKey('Not-Kebab')).rejects.toBeInstanceOf(
      MongoActionError,
    );

    const found = await service.getByKey('title');
    expect(found?._id.equals(doc._id)).toBe(true);
  });

  it('updateByKey allows label change on locked, but rejects kind change', async () => {
    const lockedDoc = mkDoc('date', 'Date', { type: 'date' }, true);
    await withCollection([lockedDoc]);

    // label update OK
    const updated = await service.updateByKey('date', {
      label: 'Date (Updated)',
    });
    expect(updated.label).toBe('Date (Updated)');

    // kind update on locked -> error
    await expect(
      service.updateByKey('date', { kind: { type: 'string' } }),
    ).rejects.toBeInstanceOf(MongoActionError);
  });

  it('deleteByKey forbids deleting locked seed and deletes custom', async () => {
    const lockedDoc = mkDoc('boolean', 'Boolean', { type: 'boolean' }, true);
    const customDoc = mkDoc('custom-del', 'Del', { type: 'string' }, false);
    await withCollection([lockedDoc, customDoc]);

    await expect(service.deleteByKey('boolean')).rejects.toBeInstanceOf(
      MongoActionError,
    );

    const res = await service.deleteByKey('custom-del');
    expect(res.deleted).toBe(true);

    const res2 = await service.deleteByKey('custom-del'); // already deleted
    expect(res2.deleted).toBe(false);
  });
});
