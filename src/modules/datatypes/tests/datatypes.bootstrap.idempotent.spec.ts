import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { DatatypesBootstrap } from '../bootstrap/datatypes.bootstrap';
import type { MongodbService } from '../../mongodb/mongodb.service';
import type { RefIntegrityService } from '../ref-integrity.service';
import { HookStore } from '../../hooks/hook.store';

describe('DatatypesBootstrap — idempotent HookStore rebuild', () => {
  const originalCi = process.env.CI;
  const originalFlag = process.env.DATATYPES_BOOTSTRAP;
  const originalDir = process.env.DATATYPES_SEEDS_DIR;

  afterEach(() => {
    process.env.CI = originalCi;
    process.env.DATATYPES_BOOTSTRAP = originalFlag;
    process.env.DATATYPES_SEEDS_DIR = originalDir;
    jest.resetAllMocks();
  });

  it('calls reset each run and does not duplicate steps', async () => {
    process.env.CI = '0';
    process.env.DATATYPES_BOOTSTRAP = '1';
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dt-hooks-idem-'));
    try {
      process.env.DATATYPES_SEEDS_DIR = tempDir;
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
            hooks: { beforeCreate: [{ action: 'validate' }] },
          },
          null,
          2,
        ),
        'utf8',
      );
      await fs.writeFile(
        path.join(tempDir, 'seo.json'),
        JSON.stringify(
          {
            key: 'seo',
            label: 'SEO',
            status: 'published',
            version: 1,
            storage: { mode: 'single' },
            fields: [],
            indexes: [],
            contributes: [
              {
                target: 'post',
                hooks: { beforeCreate: [{ action: 'ensureSlug' }] },
              },
            ],
          },
          null,
          2,
        ),
        'utf8',
      );

      // Use a real HookStore to verify flows
      const hookStore = new HookStore();

      const harness = createHarness(hookStore);
      // no existing docs so inserts happen
      harness.collection.findOne.mockResolvedValue(null);
      const lockedCursor = { toArray: jest.fn().mockResolvedValue([]) };
      harness.collection.find.mockReturnValue(lockedCursor);

      await harness.bootstrap.onModuleInit();
      const firstFlow = hookStore
        .getFlow('post', 'beforeCreate')
        .map((s) => String(s.action));

      await harness.bootstrap.onModuleInit();
      const secondFlow = hookStore
        .getFlow('post', 'beforeCreate')
        .map((s) => String(s.action));

      // reset was called twice on the instance attached to bootstrap
      // We cannot spy on hookStore.reset easily here; rely on equality of flows
      expect(firstFlow).toEqual(['validate', 'ensureSlug']);
      expect(secondFlow).toEqual(['validate', 'ensureSlug']);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});

function createHarness(hookStore: HookStore): {
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
    debug: jest.Mock;
  };
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

  const refs: Pick<RefIntegrityService, 'buildFromSeeds'> = {
    buildFromSeeds: jest.fn(),
  };
  const bootstrap = new DatatypesBootstrap(
    mongo as unknown as MongodbService,
    hookStore,
    refs as unknown as RefIntegrityService,
  );
  const logger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  (bootstrap as unknown as { logger: typeof logger }).logger = logger;

  return {
    bootstrap,
    mongo: mongo as { getDb: jest.Mock },
    collection: collectionMocks,
    logger,
  };
}
