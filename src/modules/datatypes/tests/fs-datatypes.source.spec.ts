import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { loadDatatypeSeedsFromDir } from '../seed-sources/fs-datatypes.source';

describe('FsDatatypeSeedSource', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fs-datatypes-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('loads a valid datatype file', async () => {
    await writeSeed('post.json', {
      key: 'post',
      label: 'Post',
      status: 'published',
      version: 2,
      storage: { mode: 'single' },
      fields: [{ fieldKey: 'title', required: true, array: false }],
      indexes: [],
    });

    const seeds = await loadDatatypeSeedsFromDir(tempDir);

    expect(seeds).toHaveLength(1);
    const [seed] = seeds;
    expect(seed).toMatchObject({
      key: 'post',
      keyLower: 'post',
      label: 'Post',
      status: 'published',
      version: 2,
      storage: { mode: 'single' },
      fields: [{ fieldKey: 'title', required: true, array: false }],
      indexes: [],
      locked: true,
    });
  });

  it('throws when duplicate keys are defined', async () => {
    await writeSeed('post-a.json', {
      key: 'post',
      label: 'Post A',
      status: 'published',
      version: 1,
      storage: { mode: 'single' },
      fields: [{ fieldKey: 'title', required: true, array: false }],
      indexes: [],
    });
    await writeSeed('post-b.json', {
      key: 'post',
      label: 'Post B',
      status: 'draft',
      version: 1,
      storage: { mode: 'single' },
      fields: [{ fieldKey: 'title', required: true, array: false }],
      indexes: [],
    });

    await expect(loadDatatypeSeedsFromDir(tempDir)).rejects.toThrow(
      /Duplicate datatype seed key "post".*post-a\.json.*post-b\.json/,
    );
  });

  it('throws with filename context when validation fails', async () => {
    await writeSeed('bad-datatype.json', {
      label: 'No key',
      storage: { mode: 'single' },
      fields: [],
      indexes: [],
    });

    await expect(loadDatatypeSeedsFromDir(tempDir)).rejects.toThrow(
      /bad-datatype\.json: key must be a string\./,
    );
  });

  it('ignores non-json files', async () => {
    await fs.writeFile(path.join(tempDir, 'notes.txt'), 'not a seed');
    await writeSeed('post.json', {
      key: 'post',
      label: 'Post',
      status: 'published',
      version: 1,
      storage: { mode: 'single' },
      fields: [{ fieldKey: 'title', required: true, array: false }],
      indexes: [],
    });

    const seeds = await loadDatatypeSeedsFromDir(tempDir);
    expect(seeds).toHaveLength(1);
  });

  it('returns an empty list for an empty directory', async () => {
    const seeds = await loadDatatypeSeedsFromDir(tempDir);
    expect(seeds).toEqual([]);
  });

  async function writeSeed(fileName: string, value: unknown): Promise<void> {
    const filePath = path.join(tempDir, fileName);
    await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
  }
});
