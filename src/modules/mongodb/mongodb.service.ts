import { Injectable, OnModuleDestroy } from '@nestjs/common';
import type { Db, Document, Collection } from 'mongodb';
import {
  getDb,
  getMongoClient,
  closeMongoClient,
} from './internal/mongodb.client';
import { DEFAULT_DB_NAME, isNonEmptyString } from '@lib/mongodb';
import { MongoActionError } from '../../lib/errors/MongoActionError';

@Injectable()
export class MongodbService implements OnModuleDestroy {
  /**
   * Returns a connected native driver Db handle.
   * Defaults to the project's default DB when not provided.
   */
  public async getDb(dbName?: string): Promise<Db> {
    const name: string = dbName ?? DEFAULT_DB_NAME;
    try {
      const db: Db = await getDb(name);
      return db;
    } catch (err) {
      throw MongoActionError.wrap(err, {
        operation: 'getDb',
        dbName: name,
      });
    }
  }

  /**
   * Returns a native driver Collection<T> for direct use by callers.
   * No schema enforcement here; higher layers may validate.
   */
  public async getCollection<T extends Document = Document>(
    collection: string,
    dbName?: string,
  ): Promise<Collection<T>> {
    const name: string = dbName ?? DEFAULT_DB_NAME;
    if (!isNonEmptyString(collection)) {
      throw new MongoActionError('Collection name must be a non-empty string', {
        operation: 'getCollection',
        dbName: name,
        argsPreview: { collection: String(collection) },
      });
    }

    try {
      const db: Db = await getDb(name);
      const col: Collection<T> = db.collection<T>(collection);
      return col;
    } catch (err) {
      throw MongoActionError.wrap(err, {
        operation: 'getCollection',
        dbName: name,
        collection,
      });
    }
  }

  /**
   * Runs a raw admin/DB command and returns its raw result.
   * Use sparingly; prefer collection/db methods where possible.
   */
  public async runCommand(
    command: Record<string, unknown>,
    dbName?: string,
  ): Promise<Record<string, unknown>> {
    const name: string = dbName ?? DEFAULT_DB_NAME;
    try {
      const db: Db = await getDb(name);
      const res = (await db.command(command)) as Record<string, unknown>;
      return res;
    } catch (err) {
      throw MongoActionError.wrap(err, {
        operation: 'runCommand',
        dbName: name,
        argsPreview: preview(command),
      });
    }
  }

  /** Expose underlying client if ever needed by internal modules. */
  public async getClient() {
    try {
      return await getMongoClient();
    } catch (err) {
      throw MongoActionError.wrap(err, { operation: 'getClient' });
    }
  }

  /** Graceful shutdown for local runs/tests. */
  public async onModuleDestroy(): Promise<void> {
    await closeMongoClient();
  }
}

/* ---------------------------
   Local, tiny preview helper
   --------------------------- */
function preview(
  obj?: Record<string, unknown>,
  max = 6,
): Record<string, unknown> | undefined {
  if (!obj) return undefined;
  const out: Record<string, unknown> = {};
  let i = 0;
  for (const [k, v] of Object.entries(obj)) {
    out[k] = summarize(v);
    if (++i >= max) break;
  }
  return out;
}

function summarize(v: unknown): unknown {
  if (v == null) return v;
  const t = typeof v;
  if (t === 'string') {
    const s = v as string;
    return s.length > 120 ? `${s.slice(0, 117)}...` : s;
  }
  if (t === 'number' || t === 'boolean') return v;
  if (Array.isArray(v)) return `[array(${v.length})]`;
  if (t === 'object') return '[object]';
  return `[${t}]`;
}
