import { ObjectId } from 'mongodb';
import { DatatypesBootstrap } from '../bootstrap/datatypes.bootstrap';
import { DATATYPE_SEEDS } from '../internal/datatypes.seeds';
import type { DataTypeDocBase } from '@lib/datatypes';
import type { MongodbService } from '../../mongodb/mongodb.service';

describe('DatatypesBootstrap', () => {
  const originalCi = process.env.CI;
  const originalFlag = process.env.DATATYPES_BOOTSTRAP;

  afterEach(() => {
    process.env.CI = originalCi;
    process.env.DATATYPES_BOOTSTRAP = originalFlag;
    jest.resetAllMocks();
  });

  it('runs when DATATYPES_BOOTSTRAP=1 and CI=0', async () => {
    process.env.CI = '0';
    process.env.DATATYPES_BOOTSTRAP = '1';
    const harness = createHarness();
    harness.collection.findOne.mockResolvedValue(null);
    const lockedCursor = { toArray: jest.fn().mockResolvedValue([]) };
    harness.collection.find.mockReturnValue(lockedCursor);

    await harness.bootstrap.onModuleInit();

    expect(harness.mongo.getDb).toHaveBeenCalledTimes(1);
    expect(harness.collection.createIndex).toHaveBeenCalledWith(
      { keyLower: 1 },
      { unique: true, name: 'uniq_datatypes_keyLower' },
    );
  });

  it('skips when CI=1', async () => {
    process.env.CI = '1';
    process.env.DATATYPES_BOOTSTRAP = '1';
    const harness = createHarness();

    await harness.bootstrap.onModuleInit();

    expect(harness.mongo.getDb).not.toHaveBeenCalled();
    expect(harness.logger.log).toHaveBeenCalledWith(
      expect.stringContaining('Skipping datatypes bootstrap'),
    );
  });

  it('skips when DATATYPES_BOOTSTRAP=0', async () => {
    process.env.CI = '0';
    process.env.DATATYPES_BOOTSTRAP = '0';
    const harness = createHarness();

    await harness.bootstrap.onModuleInit();

    expect(harness.mongo.getDb).not.toHaveBeenCalled();
    expect(harness.logger.log).toHaveBeenCalledWith(
      expect.stringContaining('Skipping datatypes bootstrap'),
    );
  });

  it('inserts missing seed datatypes as locked documents', async () => {
    process.env.CI = '0';
    process.env.DATATYPES_BOOTSTRAP = '1';
    const harness = createHarness();
    harness.collection.findOne.mockResolvedValue(null);
    const lockedCursor = { toArray: jest.fn().mockResolvedValue([]) };
    harness.collection.find.mockReturnValue(lockedCursor);
    const insertedDocs: DataTypeDocBase[] = [];
    harness.collection.insertOne.mockImplementation((doc: DataTypeDocBase) => {
      insertedDocs.push(doc);
      return Promise.resolve({ acknowledged: true });
    });

    await harness.bootstrap.onModuleInit();

    expect(harness.collection.insertOne).toHaveBeenCalledTimes(
      DATATYPE_SEEDS.length,
    );
    const seed = DATATYPE_SEEDS[0];
    expect(insertedDocs[0]).toMatchObject({
      key: seed.key,
      keyLower: seed.keyLower,
      locked: true,
      status: seed.status,
      version: seed.version,
      fields: seed.fields,
      storage: { mode: seed.storage.mode },
      indexes: seed.indexes,
    });
    expect(insertedDocs[0]?.createdAt).toBeInstanceOf(Date);
    expect(insertedDocs[0]?.updatedAt).toBeInstanceOf(Date);
  });

  it('reconciles existing seed datatypes without touching the _id', async () => {
    process.env.CI = '0';
    process.env.DATATYPES_BOOTSTRAP = '1';
    const harness = createHarness();
    const seed = DATATYPE_SEEDS[0];
    const existing: DataTypeDocBase & { _id: ObjectId } = {
      _id: new ObjectId(),
      key: seed.key,
      keyLower: seed.keyLower,
      label: 'Legacy label',
      status: 'draft',
      version: 1,
      fields: [],
      storage: { mode: 'single' },
      indexes: [],
      locked: true,
      createdAt: new Date('2023-01-01T00:00:00Z'),
      updatedAt: new Date('2023-01-01T00:00:00Z'),
    };
    harness.collection.findOne.mockResolvedValue(existing);
    const lockedCursor = { toArray: jest.fn().mockResolvedValue([]) };
    harness.collection.find.mockReturnValue(lockedCursor);
    let updateSet: Partial<DataTypeDocBase> | undefined;
    harness.collection.updateOne.mockImplementation((_filter, update) => {
      updateSet = (update as { $set: Partial<DataTypeDocBase> }).$set;
      return Promise.resolve({ acknowledged: true });
    });

    await harness.bootstrap.onModuleInit();

    expect(harness.collection.insertOne).not.toHaveBeenCalled();
    expect(harness.collection.updateOne).toHaveBeenCalledTimes(1);
    expect(updateSet).toMatchObject({
      label: seed.label,
      status: seed.status,
      version: seed.version,
      locked: true,
      fields: seed.fields,
      storage: { mode: seed.storage.mode },
      indexes: seed.indexes,
    });
    expect(updateSet?.updatedAt).toBeInstanceOf(Date);
  });

  it('logs a warning for locked datatypes not in the seed set', async () => {
    process.env.CI = '0';
    process.env.DATATYPES_BOOTSTRAP = '1';
    const harness = createHarness();
    const seed = DATATYPE_SEEDS[0];
    const existing: DataTypeDocBase & { _id: ObjectId } = {
      _id: new ObjectId(),
      key: seed.key,
      keyLower: seed.keyLower,
      label: seed.label,
      status: seed.status,
      version: seed.version,
      fields: seed.fields,
      storage: { mode: seed.storage.mode },
      indexes: seed.indexes,
      locked: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    harness.collection.findOne.mockResolvedValue(existing);
    const lockedCursor = {
      toArray: jest.fn().mockResolvedValue([
        { key: seed.key, keyLower: seed.keyLower, locked: true },
        { key: 'legacy', keyLower: 'legacy', locked: true },
      ]),
    };
    harness.collection.find.mockReturnValue(lockedCursor);

    await harness.bootstrap.onModuleInit();

    expect(harness.logger.warn).toHaveBeenCalledWith(
      'Locked datatype not in seed set: "legacy" (left untouched).',
    );
  });
});

type Harness = {
  bootstrap: DatatypesBootstrap;
  mongo: { getDb: jest.Mock };
  collection: {
    createIndex: jest.Mock;
    findOne: jest.Mock;
    insertOne: jest.Mock;
    updateOne: jest.Mock;
    find: jest.Mock;
    aggregate: jest.Mock;
  };
  logger: {
    log: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
  };
};

function createHarness(): Harness {
  const collectionMocks = {
    createIndex: jest.fn().mockResolvedValue(undefined),
    findOne: jest.fn(),
    insertOne: jest.fn().mockResolvedValue({ acknowledged: true }),
    updateOne: jest.fn().mockResolvedValue({ acknowledged: true }),
    find: jest.fn(),
    aggregate: jest
      .fn()
      .mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) }),
  };
  const collection = collectionMocks as unknown as {
    createIndex: Harness['collection']['createIndex'];
    findOne: Harness['collection']['findOne'];
    insertOne: Harness['collection']['insertOne'];
    updateOne: Harness['collection']['updateOne'];
    find: Harness['collection']['find'];
    aggregate: Harness['collection']['aggregate'];
  };
  const db = { collection: jest.fn().mockReturnValue(collection) };
  const mongo = {
    getDb: jest.fn().mockResolvedValue(db),
  };

  const bootstrap = new DatatypesBootstrap(mongo as unknown as MongodbService);
  const logger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  (bootstrap as unknown as { logger: Harness['logger'] }).logger = logger;

  return {
    bootstrap,
    mongo: mongo as { getDb: jest.Mock },
    collection: collectionMocks,
    logger,
  };
}
