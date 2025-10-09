import { parseDatatypeSeedLiteral } from '../internal/datatypes.seeds';

describe('Datatype seed hooks parsing', () => {
  it('accepts valid hooks with 1+ phases', () => {
    const seed = parseDatatypeSeedLiteral(
      {
        key: 'post',
        label: 'Post',
        status: 'published',
        version: 1,
        storage: { mode: 'single' },
        fields: [{ fieldKey: 'string', required: true, array: false }],
        indexes: [],
        hooks: {
          beforeCreate: [
            { action: 'validate', args: { schema: 'post.create' } },
          ],
          afterGet: [{ action: 'enrich', args: { with: ['author'] } }],
        },
      },
      'unit',
    );

    expect(seed.hooks).toBeDefined();
    expect(seed.hooks?.beforeCreate).toEqual([
      { action: 'validate', args: { schema: 'post.create' } },
    ]);
    expect(seed.hooks?.afterGet).toEqual([
      { action: 'enrich', args: { with: ['author'] } },
    ]);
  });

  it('rejects invalid phase names', () => {
    expect(() =>
      parseDatatypeSeedLiteral(
        {
          key: 'post',
          label: 'Post',
          version: 1,
          status: 'draft',
          storage: { mode: 'single' },
          fields: [],
          indexes: [],
          hooks: { notAPhase: [] },
        } as unknown,
        'ctx',
      ),
    ).toThrow(/hooks phase "notAPhase" is not supported/);
  });

  it('rejects non-array values for a phase', () => {
    expect(() =>
      parseDatatypeSeedLiteral(
        {
          key: 'post',
          label: 'Post',
          version: 1,
          status: 'draft',
          storage: { mode: 'single' },
          fields: [],
          indexes: [],
          hooks: { beforeCreate: {} },
        } as unknown,
        'ctx',
      ),
    ).toThrow(/hooks\.beforeCreate must be an array/);
  });

  it('rejects steps without action string', () => {
    expect(() =>
      parseDatatypeSeedLiteral(
        {
          key: 'post',
          label: 'Post',
          version: 1,
          status: 'draft',
          storage: { mode: 'single' },
          fields: [],
          indexes: [],
          hooks: { beforeCreate: [{ action: 123 }] },
        } as unknown,
        'ctx',
      ),
    ).toThrow(/hooks\.beforeCreate\[0\]: action must be a non-empty string/);
  });

  it('preserves args object shape', () => {
    const seed = parseDatatypeSeedLiteral(
      {
        key: 'post',
        label: 'Post',
        status: 'published',
        version: 1,
        storage: { mode: 'single' },
        fields: [],
        indexes: [],
        hooks: {
          afterGet: [
            {
              action: 'enrich',
              args: { with: ['author'], flags: { deep: true } },
            },
          ],
        },
      },
      'unit',
    );
    expect(seed.hooks?.afterGet?.[0]?.args).toEqual({
      with: ['author'],
      flags: { deep: true },
    });
  });
});
