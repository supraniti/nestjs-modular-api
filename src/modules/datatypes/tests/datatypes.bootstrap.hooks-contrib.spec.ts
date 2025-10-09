import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { DatatypesBootstrap } from '../bootstrap/datatypes.bootstrap';
import type { MongodbService } from '../../mongodb/mongodb.service';
import type { RefIntegrityService } from '../ref-integrity.service';
import { HookStore } from '../../hooks/hook.store';

describe('DatatypesBootstrap — HookStore contributions', () => {
  const originalCi = process.env.CI;
  const originalFlag = process.env.DATATYPES_BOOTSTRAP;
  const originalDir = process.env.DATATYPES_SEEDS_DIR;

  afterEach(() => {
    process.env.CI = originalCi;
    process.env.DATATYPES_BOOTSTRAP = originalFlag;
    process.env.DATATYPES_SEEDS_DIR = originalDir;
    jest.resetAllMocks();
  });

  it('resets once and applies own hooks then contributions in order', async () => {
    process.env.CI = '0';
    process.env.DATATYPES_BOOTSTRAP = '1';
    const tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'dt-hooks-contrib-'),
    );
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
        path.join(tempDir, 'taxonomy.json'),
        JSON.stringify(
          {
            key: 'taxonomy',
            label: 'Taxonomy',
            status: 'published',
            version: 1,
            storage: { mode: 'single' },
            fields: [{ fieldKey: 'string', required: true, array: false }],
            indexes: [],
            hooks: { beforeCreate: [{ action: 'validate' }] },
            contributes: [
              {
                target: 'post',
                hooks: { afterGet: [{ action: 'enrich' }] },
              },
            ],
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

      const harness = createHarness();
      // no existing docs so inserts happen
      harness.collection.findOne.mockResolvedValue(null);
      const lockedCursor = { toArray: jest.fn().mockResolvedValue([]) };
      harness.collection.find.mockReturnValue(lockedCursor);

      await harness.bootstrap.onModuleInit();

      // reset called once before patches
      expect(harness.hookStore.reset).toHaveBeenCalledTimes(1);
      const resetCall = harness.hookStore.reset.mock.invocationCallOrder[0];
      const firstPatchCall =
        harness.hookStore.applyPatch.mock.invocationCallOrder[0];
      expect(resetCall).toBeLessThan(firstPatchCall);

      const callsArr = harness.hookStore.applyPatch.mock.calls as Array<
        [Record<string, unknown>]
      >;
      const calls = callsArr.map((c) => c[0]);
      // Own hooks (in seed load order): post, taxonomy; then contributions: seo, taxonomy (FS files sorted lexicographically)
      expect(calls[0]).toMatchObject({
        typeKey: 'post',
        phases: { beforeCreate: [{ action: 'validate' }] },
      });
      expect(calls[1]).toMatchObject({
        typeKey: 'taxonomy',
        phases: { beforeCreate: [{ action: 'validate' }] },
      });
      expect(calls[2]).toMatchObject({
        typeKey: 'post',
        phases: { beforeCreate: [{ action: 'ensureSlug' }] },
      });
      expect(calls[3]).toMatchObject({
        typeKey: 'post',
        phases: { afterGet: [{ action: 'enrich' }] },
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
  logger: {
    log: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
    debug: jest.Mock;
  };
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
  const hookStore = {
    applyPatch: jest.fn(),
    reset: jest.fn(),
  } as unknown as jest.Mocked<HookStore> & {
    applyPatch: jest.Mock;
    reset: jest.Mock;
  };

  const refs: Pick<RefIntegrityService, 'buildFromSeeds'> = {
    buildFromSeeds: jest.fn(),
  };
  const bootstrap = new DatatypesBootstrap(
    mongo as unknown as MongodbService,
    hookStore as unknown as import('../../hooks/hook.store').HookStore,
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
    hookStore: hookStore as unknown as {
      applyPatch: jest.Mock;
      reset: jest.Mock;
    },
  };
}
