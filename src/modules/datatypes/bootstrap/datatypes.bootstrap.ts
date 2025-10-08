import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Collection, Document } from 'mongodb';

import { MongoActionError } from '../../../lib/errors/MongoActionError';
import { MongodbService } from '../../mongodb/mongodb.service';
import {
  DATATYPES_COLLECTION,
  type DataTypeDocBase,
  type EntityField,
  type EntityIndexSpec,
} from '../internal';
import {
  DATATYPE_SEEDS,
  type DatatypeSeed,
  isDatatypeSeedKey,
} from '../internal';

/**
 * Seed & index bootstrap for the `datatypes` collection.
 * - Ensures a unique index on `keyLower`.
 * - Inserts or reconciles baseline datatype definitions (locked).
 * - Skips automatically on CI (CI=true/1) or when disabled via env.
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
      const coll = await this.getDatatypesCollection();
      await this.ensureIndexes(coll);
      await this.syncSeeds(coll);
      this.logger.log('Datatypes bootstrap complete.');
    } catch (err) {
      throw MongoActionError.wrap(err, { operation: 'datatypesBootstrap' });
    }
  }

  private async getDatatypesCollection(): Promise<Collection<DataTypeDocBase>> {
    const db = await this.mongo.getDb();
    return db.collection<DataTypeDocBase>(DATATYPES_COLLECTION);
  }

  private async ensureIndexes(
    coll: Collection<DataTypeDocBase>,
  ): Promise<void> {
    await coll.createIndex(
      { keyLower: 1 },
      { unique: true, name: 'uniq_datatypes_keyLower' },
    );
  }

  private async syncSeeds(coll: Collection<DataTypeDocBase>): Promise<void> {
    const now = new Date();

    for (const seed of DATATYPE_SEEDS) {
      const existing = await coll.findOne({
        keyLower: seed.keyLower,
      } as Document);

      if (!existing) {
        await coll.insertOne(this.buildSeedDoc(seed, now));
        this.logger.log(`Inserted seed datatype: ${seed.key}`);
        continue;
      }

      await coll.updateOne(
        { _id: existing._id } as Document,
        {
          $set: this.buildSeedUpdate(seed, now),
        } as Document,
      );
      this.logger.log(`Reconciled seed datatype: ${seed.key}`);
    }

    const locked = await coll
      .find({ locked: true } as Document, { projection: { key: 1, _id: 0 } })
      .toArray();

    for (const doc of locked) {
      const key = (doc as { key?: unknown }).key;
      if (typeof key === 'string' && !isDatatypeSeedKey(key)) {
        this.logger.warn(
          `Locked datatype not in seed set: "${key}" (left untouched).`,
        );
      }
    }
  }

  private buildSeedDoc(seed: DatatypeSeed, now: Date): DataTypeDocBase {
    return {
      key: seed.key,
      keyLower: seed.keyLower,
      label: seed.label,
      version: seed.version,
      status: seed.status,
      fields: this.cloneFields(seed.fields),
      storage: { mode: seed.storage.mode },
      indexes: this.cloneIndexes(seed.indexes),
      locked: true,
      createdAt: now,
      updatedAt: now,
    } satisfies DataTypeDocBase;
  }

  private buildSeedUpdate(
    seed: DatatypeSeed,
    now: Date,
  ): Partial<DataTypeDocBase> {
    const update: Partial<DataTypeDocBase> = {
      label: seed.label,
      version: seed.version,
      status: seed.status,
      fields: this.cloneFields(seed.fields),
      storage: { mode: seed.storage.mode },
      indexes: this.cloneIndexes(seed.indexes),
      locked: true,
      updatedAt: now,
    };

    return update;
  }

  private cloneFields(fields: DatatypeSeed['fields']): EntityField[] {
    return fields.map((f) => ({
      fieldKey: f.fieldKey,
      required: f.required ?? false,
      array: f.array ?? false,
      unique: f.unique === true ? true : undefined,
      constraints: f.constraints ? { ...f.constraints } : undefined,
      order: f.order,
    }));
  }

  private cloneIndexes(
    indexes: ReadonlyArray<EntityIndexSpec>,
  ): EntityIndexSpec[] {
    return indexes.map((idx) => ({
      keys: { ...idx.keys },
      options: idx.options ? { ...idx.options } : undefined,
    }));
  }
}

function shouldRunBootstrap(): boolean {
  const ci = String(process.env.CI ?? '').toLowerCase();
  if (ci === 'true' || ci === '1') return false;
  const flag = String(process.env.DATATYPES_BOOTSTRAP ?? '1');
  return flag !== '0' && flag.toLowerCase() !== 'false';
}
