import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { DatatypesBootstrap } from '../bootstrap/datatypes.bootstrap';
import type { MongodbService } from '../../mongodb/mongodb.service';

describe('DatatypesBootstrap – HookStore registration', () => {
  const originalCi = process.env.CI;
  const originalFlag = process.env.DATATYPES_BOOTSTRAP;
  const originalDir = process.env.DATATYPES_SEEDS_DIR;

  afterEach(() => {
    process.env.CI = originalCi;
    process.env.DATATYPES_BOOTSTRAP = originalFlag;
    process.env.DATATYPES_SEEDS_DIR = originalDir;
    jest.resetAllMocks();
  });

  it('applies HookStore patches for seeds with hooks (FS source)', async () => {
    process.env.CI = '0';
    process.env.DATATYPES_BOOTSTRAP = '1';
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dt-hooks-'));
    try {
      process.env.DATATYPES_SEEDS_DIR = tempDir;
      // Write a seed that overrides built-in "post" and adds hooks
      await fs.writeFile(
        path.join(tempDir, 'post.json'),
        JSON.stringify(
          {
            key: 'post',
            label: 'Post',
            status: 'published',
            version: 1,
            storage: { mode: 'single' },
            fields: [{ fieldKey: 'string', required: true, array: false }],
            indexes: [],
            hooks: {
              beforeCreate: [{ action: 'validate' }],
              afterGet: [{ action: 'enrich', args: { with: ['author'] } }],
            },
          },
          null,
          2,
        ),
        'utf8',
      );

      const harness = createHarness();
      // no existing docs so inserts happen
      harness.collection.findOne.mockResolvedValue(null);
      const lockedCursor = { toArray: jest.fn().mockResolvedValue([]) };
      harness.collection.find.mockReturnValue(lockedCursor);

      await harness.bootstrap.onModuleInit();

      expect(harness.hookStore.applyPatch).toHaveBeenCalledWith({
        typeKey: 'post',
        phases: {
          beforeCreate: [{ action: 'validate' }],
          afterGet: [{ action: 'enrich', args: { with: ['author'] } }],
        },
      });
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});

function createHarness(): {
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
  logger: { log: jest.Mock; warn: jest.Mock; error: jest.Mock };
  hookStore: { applyPatch: jest.Mock; reset: jest.Mock };
} {
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
    createIndex: typeof collectionMocks.createIndex;
    findOne: typeof collectionMocks.findOne;
    insertOne: typeof collectionMocks.insertOne;
    updateOne: typeof collectionMocks.updateOne;
    find: typeof collectionMocks.find;
    aggregate: typeof collectionMocks.aggregate;
  };
  const db = { collection: jest.fn().mockReturnValue(collection) };
  const mongo = {
    getDb: jest.fn().mockResolvedValue(db),
  };
  const hookStore = { applyPatch: jest.fn(), reset: jest.fn() };

  const bootstrap = new DatatypesBootstrap(
    mongo as unknown as MongodbService,
    hookStore as unknown as import('../../hooks/hook.store').HookStore,
  );
  const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  (bootstrap as unknown as { logger: typeof logger }).logger = logger;

  return {
    bootstrap,
    mongo: mongo as { getDb: jest.Mock },
    collection: collectionMocks,
    logger,
    hookStore,
  };
}
