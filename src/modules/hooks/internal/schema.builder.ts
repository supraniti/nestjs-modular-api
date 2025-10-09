export type FieldType = 'string' | 'number' | 'boolean' | 'date' | 'enum';

export interface FieldConstraints {
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  min?: number;
  max?: number;
  integer?: boolean;
  enumValues?: string[];
  enumCaseInsensitive?: boolean;
}

export interface DatatypeFieldSpec {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  array?: boolean;
  unique?: boolean;
  constraints?: FieldConstraints;
  order?: number;
}

export function buildEntitySchema(
  fields: ReadonlyArray<DatatypeFieldSpec>,
  mode: 'create' | 'update',
): object {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const f of fields) {
    const base = scalarSchema(f);
    properties[f.key] = f.array ? { type: 'array', items: base } : base;
    if (mode === 'create' && f.required) required.push(f.key);
  }

  const schema: Record<string, unknown> = {
    type: 'object',
    additionalProperties: false,
    properties,
  };
  if (mode === 'create' && required.length > 0) schema.required = required;
  return schema;
}

function scalarSchema(f: DatatypeFieldSpec): object {
  switch (f.type) {
    case 'string':
      return {
        type: 'string',
        ...(f.constraints?.minLength != null
          ? { minLength: f.constraints.minLength }
          : {}),
        ...(f.constraints?.maxLength != null
          ? { maxLength: f.constraints.maxLength }
          : {}),
        ...(f.constraints?.pattern ? { pattern: f.constraints.pattern } : {}),
      };
    case 'number': {
      const integer = f.constraints?.integer === true;
      return {
        type: integer ? 'integer' : 'number',
        ...(f.constraints?.min != null ? { minimum: f.constraints.min } : {}),
        ...(f.constraints?.max != null ? { maximum: f.constraints.max } : {}),
        ...(integer ? { multipleOf: 1 } : {}),
      };
    }
    case 'boolean':
      return { type: 'boolean' };
    case 'date':
      return { type: 'string', format: 'date-time' };
    case 'enum':
      return {
        type: 'string',
        ...(Array.isArray(f.constraints?.enumValues)
          ? { enum: f.constraints?.enumValues }
          : {}),
      };
    default:
      return { type: 'string' };
  }
}
