import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Collection, Document, WithId } from 'mongodb';
import { MongodbService } from '../../mongodb/mongodb.service';
import {
  FIELDS_COLLECTION,
  type FieldDoc,
  type FieldDocBase,
  isFieldKind,
} from '@lib/fields';
import { FIELD_SEEDS, isSeedKey } from '../internal/fields.seeds';
import { MongoActionError } from '../../../lib/errors/MongoActionError';

/**
 * Seed & index bootstrap for the `fields` collection.
 * - Creates a unique index on `keyLower`.
 * - Ensures baseline seed field types exist (locked).
 * - Runs only outside CI (CI=true/1).
 */
@Injectable()
export class FieldsBootstrap implements OnModuleInit {
  private readonly logger = new Logger(FieldsBootstrap.name);

  constructor(private readonly mongo: MongodbService) {}

  public async onModuleInit(): Promise<void> {
    if (!shouldRunBootstrap()) {
      this.logger.log('Skipping fields bootstrap (CI or disabled by env).');
      return;
    }

    try {
      const coll = await this.getFieldsCollection();
      await this.ensureIndexes(coll);
      await this.syncSeeds(coll);
      this.logger.log('Fields bootstrap complete.');
    } catch (err) {
      // Fail fast in local dev — this indicates a real issue worth fixing.
      throw MongoActionError.wrap(err, { operation: 'fieldsBootstrap' });
    }
  }

  /* ------------------------------
   * helpers
   * ------------------------------ */

  private async getFieldsCollection(): Promise<Collection<FieldDocBase>> {
    const db = await this.mongo.getDb(); // defaults to DEFAULT_DB_NAME
    const coll: Collection<FieldDocBase> =
      db.collection<FieldDocBase>(FIELDS_COLLECTION);
    return coll;
  }

  private async ensureIndexes(coll: Collection<FieldDocBase>): Promise<void> {
    // Unique, case-insensitive semantics via a normalized `keyLower` column.
    await coll.createIndex(
      { keyLower: 1 },
      { unique: true, name: 'uniq_fields_keyLower' },
    );
  }

  private async syncSeeds(coll: Collection<FieldDocBase>): Promise<void> {
    const now: Date = new Date();

    for (const seed of FIELD_SEEDS) {
      // Try to find an existing doc by normalized key
      const existing: WithId<FieldDocBase> | null = await coll.findOne({
        keyLower: seed.keyLower,
      } as Document);

      if (!existing) {
        // Insert new locked seed (no _id — driver will assign)
        const insertDoc: FieldDocBase = {
          key: seed.key,
          keyLower: seed.keyLower,
          label: seed.label,
          kind: seed.kind,
          locked: true,
          createdAt: now,
          updatedAt: now,
        };
        await coll.insertOne(insertDoc);
        this.logger.log(`Inserted seed field: ${seed.key}`);
        continue;
      }

      // Existing: ensure it's locked and keep invariants. Only update allowed properties.
      // We do NOT mutate `key`, `keyLower`, or `kind` for existing locked seeds.
      const setUpdate: Partial<FieldDocBase> = {
        label: seed.label, // allow updating label to keep seeds fresh
        locked: true,
        updatedAt: now,
      };

      // Sanity logs: if someone changed the kind shape, we warn but do not overwrite.
      if (!isFieldKind((existing as FieldDoc).kind)) {
        this.logger.warn(
          `Existing seed "${existing.key}" has invalid kind shape; leaving as-is.`,
        );
      }

      await coll.updateOne(
        { _id: existing._id } as Document,
        { $set: setUpdate } as Document,
      );
      this.logger.log(`Reconciled seed field: ${seed.key}`);
    }

    // Optional sanity: warn for any locked docs that are not in the canonical seed set.
    const foreignLocked = await coll
      .find({ locked: true } as Document, { projection: { key: 1, _id: 0 } })
      .toArray();

    for (const doc of foreignLocked) {
      const k = (doc as { key?: unknown }).key;
      if (typeof k === 'string' && !isSeedKey(k)) {
        this.logger.warn(
          `Locked field not in seed set: "${k}" (left untouched).`,
        );
      }
    }
  }
}

/** Bootstrap gating: run locally, skip on CI or when disabled explicitly. */
function shouldRunBootstrap(): boolean {
  const ci = String(process.env.CI ?? '').toLowerCase();
  if (ci === 'true' || ci === '1') return false;
  const flag = String(process.env.FIELDS_BOOTSTRAP ?? '1'); // default ON locally
  return flag !== '0' && flag.toLowerCase() !== 'false';
}
