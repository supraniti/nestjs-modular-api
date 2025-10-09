import {
  buildEntitySchema,
  type DatatypeFieldSpec,
} from '../internal/schema.builder';

describe('Schema Builder', () => {
  it('builds JSON Schema from fields (create)', () => {
    const fields: DatatypeFieldSpec[] = [
      {
        key: 'title',
        label: 'Title',
        type: 'string',
        required: true,
        constraints: { minLength: 1, maxLength: 160 },
      },
      {
        key: 'tags',
        label: 'Tags',
        type: 'string',
        array: true,
      },
    ];

    const schema = buildEntitySchema(fields, 'create') as Record<
      string,
      unknown
    >;
    expect(schema.type).toBe('object');
    expect(schema['additionalProperties']).toBe(false);
    const props = schema['properties'] as Record<string, unknown>;
    expect(props['title']).toBeDefined();
    expect(props['tags']).toBeDefined();
    const required = schema['required'] as string[];
    expect(required).toContain('title');
    expect(required).not.toContain('tags');
    const title = props['title'] as Record<string, unknown>;
    expect(title['type']).toBe('string');
    expect(title['minLength']).toBe(1);
    expect(title['maxLength']).toBe(160);
    const tags = props['tags'] as Record<string, unknown>;
    expect(tags['type']).toBe('array');
    const items = tags['items'] as Record<string, unknown>;
    expect(items['type']).toBe('string');
  });

  it('builds partial schema for update (no required)', () => {
    const fields: DatatypeFieldSpec[] = [
      { key: 'title', label: 'Title', type: 'string', required: true },
    ];
    const schema = buildEntitySchema(fields, 'update') as Record<
      string,
      unknown
    >;
    expect(schema['required']).toBeUndefined();
  });
});
