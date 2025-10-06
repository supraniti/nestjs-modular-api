import { MongoClient, Db, MongoClientOptions } from 'mongodb';
import {
  loadMongoInfraConfig,
  buildMongoUri,
} from '../../../infra/mongo/mongo.config';
import { DEFAULT_DB_NAME, type GetDb } from './mongodb.types';

/**
 * Lazy singleton for a MongoDB client.
 * - Strictly typed (no unions with null).
 * - Single connect attempt at a time is deduplicated.
 * - Graceful close on shutdown.
 * - No API re-invention: consumers use native driver via getDb()/getMongoClient().
 */
class LazyMongoClient {
  private readonly uri: string;
  private client?: MongoClient;
  private connecting?: Promise<MongoClient>;

  constructor() {
    const cfg = loadMongoInfraConfig();
    this.uri = buildMongoUri(cfg, 'admin'); // authSource=admin; select DB via db(name)
  }

  /** Get (or create) a connected MongoClient instance. */
  public async getClient(): Promise<MongoClient> {
    const existing: MongoClient | undefined = this.client;
    if (existing) return existing;

    const inflight: Promise<MongoClient> | undefined = this.connecting;
    if (inflight) return inflight;

    const options: MongoClientOptions = {
      ignoreUndefined: true,
    };

    const connectPromise: Promise<MongoClient> = (async () => {
      const created = new MongoClient(this.uri, options);
      await created.connect();
      this.client = created;
      this.connecting = undefined;
      return created;
    })();

    this.connecting = connectPromise;

    try {
      const connected: MongoClient = await connectPromise;
      return connected;
    } catch (err) {
      // Reset so a subsequent call can retry.
      this.connecting = undefined;
      this.client = undefined;

      if (err instanceof Error) {
        throw err;
      }
      throw new Error('Failed to connect to MongoDB');
    }
  }

  /** Get a Db handle (defaults to DEFAULT_DB_NAME). */
  public async getDb(dbName?: string): Promise<Db> {
    const client: MongoClient = await this.getClient();
    const target: string = dbName ?? DEFAULT_DB_NAME;
    const db: Db = client.db(target);
    return db;
  }

  /** Close client if connected (idempotent). */
  public async close(): Promise<void> {
    const current: MongoClient | undefined = this.client;
    if (!current) return;
    this.client = undefined;
    this.connecting = undefined;
    await current.close();
  }
}

const lazyClient = new LazyMongoClient();

/** Public helper: get a Db by name (native driver Db). */
export const getDb: GetDb = async (dbName?: string): Promise<Db> => {
  const db: Db = await lazyClient.getDb(dbName);
  return db;
};

/** Public helper: get the underlying MongoClient (native driver). */
export async function getMongoClient(): Promise<MongoClient> {
  const client: MongoClient = await lazyClient.getClient();
  return client;
}

/** Public helper for tests/teardown. */
export async function closeMongoClient(): Promise<void> {
  await lazyClient.close();
}
