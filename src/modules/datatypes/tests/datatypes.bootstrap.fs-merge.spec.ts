import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { DataTypeDocBase } from '@lib/datatypes';

import { DATATYPE_SEEDS } from '../internal/datatypes.seeds';
import { createHarness, type Harness } from './datatypes.bootstrap.spec';

describe('DatatypesBootstrap (filesystem merge)', () => {
  const originalCi = process.env.CI;
  const originalFlag = process.env.DATATYPES_BOOTSTRAP;
  const originalSeedsDir = process.env.DATATYPES_SEEDS_DIR;

  let tempDir: string;

  beforeEach(async () => {
    process.env.CI = '0';
    process.env.DATATYPES_BOOTSTRAP = '1';
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'datatype-seeds-'));
    process.env.DATATYPES_SEEDS_DIR = tempDir;
  });

  afterEach(async () => {
    process.env.CI = originalCi;
    process.env.DATATYPES_BOOTSTRAP = originalFlag;
    process.env.DATATYPES_SEEDS_DIR = originalSeedsDir;
    await fs.rm(tempDir, { recursive: true, force: true });
    jest.resetAllMocks();
  });

  it('loads filesystem seeds and overrides JSON seeds when provided', async () => {
    await writeSeed('post.json', {
      key: 'post',
      label: 'Post (FS)',
      status: 'published',
      version: 2,
      storage: { mode: 'single' },
      fields: [{ fieldKey: 'title', required: true, array: false }],
      indexes: [],
    });

    await writeSeed('comment.json', {
      key: 'comment',
      label: 'Comment',
      status: 'draft',
      version: 1,
      storage: { mode: 'single' },
      fields: [{ fieldKey: 'body', required: true, array: false }],
      indexes: [],
    });

    const harness = createHarness();
    const insertedDocs: DataTypeDocBase[] = [];
    harness.collection.findOne.mockResolvedValue(null);
    harness.collection.find.mockReturnValue({
      toArray: jest.fn().mockResolvedValue([]),
    });
    harness.collection.insertOne.mockImplementation((doc: DataTypeDocBase) => {
      insertedDocs.push(doc);
      return Promise.resolve({ acknowledged: true });
    });

    await harness.bootstrap.onModuleInit();

    expect(harness.collection.createIndex).toHaveBeenCalledWith(
      { keyLower: 1 },
      { unique: true, name: 'uniq_datatypes_keyLower' },
    );
    expect(insertedDocs).toHaveLength(DATATYPE_SEEDS.length + 1);
    expect(insertedDocs.map((doc) => doc.key)).toEqual(
      expect.arrayContaining(['post', 'comment']),
    );
    const postDoc = insertedDocs.find((doc) => doc.key === 'post');
    expect(postDoc).toMatchObject({
      label: 'Post (FS)',
      version: 2,
    });
    const commentDoc = insertedDocs.find((doc) => doc.key === 'comment');
    expect(commentDoc).toMatchObject({
      label: 'Comment',
      keyLower: 'comment',
    });

    const logMessages = extractLogMessages(harness);
    expect(logMessages).toEqual(
      expect.arrayContaining([
        expect.stringContaining(`Loaded 2 datatype seeds from FS: ${tempDir}`),
        'Inserted seed datatype: post',
        'Inserted seed datatype: comment',
      ]),
    );
  });

  function extractLogMessages(harness: Harness): string[] {
    return (harness.logger.log.mock.calls as ReadonlyArray<[unknown]>).map(
      ([message]) => String(message),
    );
  }

  async function writeSeed(fileName: string, value: unknown): Promise<void> {
    const filePath = path.join(tempDir, fileName);
    await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
  }
});
