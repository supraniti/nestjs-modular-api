import { loadDatatypeSeedsFromDir } from '../seed-sources/fs-datatypes.source';
import { parseDatatypeSeedLiteral } from '../internal/datatypes.seeds';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

describe('Datatype seed contributes parser', () => {
  it('accepts multiple targets and phases; preserves order', () => {
    const seed = parseDatatypeSeedLiteral(
      {
        key: 'taxonomy',
        label: 'Taxonomy',
        status: 'published',
        version: 1,
        storage: { mode: 'single' },
        fields: [{ fieldKey: 'name', required: true, array: false }],
        indexes: [],
        contributes: [
          {
            target: 'post',
            hooks: {
              beforeCreate: [
                { action: 'validate', args: { schema: 'taxonomy.rules' } },
              ],
              afterGet: [{ action: 'enrich', args: { with: ['taxonomies'] } }],
            },
          },
          {
            target: 'comment',
            hooks: {
              beforeCreate: [
                { action: 'validate', args: { schema: 'comment.rules' } },
              ],
            },
          },
        ],
      },
      'unit',
    );

    expect(seed.contributes).toBeDefined();
    expect(seed.contributes?.length).toBe(2);
    expect(seed.contributes?.[0]?.target).toBe('post');
    expect(seed.contributes?.[0]?.hooks.beforeCreate?.[0]).toEqual({
      action: 'validate',
      args: { schema: 'taxonomy.rules' },
    });
    expect(seed.contributes?.[0]?.hooks.afterGet?.[0]).toEqual({
      action: 'enrich',
      args: { with: ['taxonomies'] },
    });
    expect(seed.contributes?.[1]?.target).toBe('comment');
  });

  it('enforces kebab-case targets and normalizes lower', () => {
    expect(() =>
      parseDatatypeSeedLiteral(
        {
          key: 'seo',
          label: 'Seo',
          status: 'published',
          version: 1,
          storage: { mode: 'single' },
          fields: [],
          indexes: [],
          contributes: [
            { target: 'Post', hooks: { beforeCreate: [{ action: 'ensure' }] } },
          ],
        } as unknown,
        'ctx',
      ),
    ).toThrow(/contributes\[0\]: target must be kebab-case/);
  });

  it('rejects bad shapes and includes filename in FS errors', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'dt-contrib-'));
    try {
      await fs.writeFile(
        path.join(tmp, 'bad.json'),
        JSON.stringify(
          {
            key: 'seo',
            label: 'Seo',
            status: 'published',
            version: 1,
            storage: { mode: 'single' },
            fields: [],
            indexes: [],
            contributes: { target: 'post' }, // should be array
          },
          null,
          2,
        ),
        'utf8',
      );

      await expect(loadDatatypeSeedsFromDir(tmp)).rejects.toThrow(
        /bad\.json.*contributes must be an array/,
      );
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
