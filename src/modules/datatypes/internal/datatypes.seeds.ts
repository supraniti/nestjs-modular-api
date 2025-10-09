import {
  DATATYPES_COLLECTION,
  type EntityField,
  type EntityIndexSpec,
  type StorageMode,
} from '@lib/datatypes';
import { isKebabCaseKey, normalizeKeyLower } from '@lib/fields';

import rawSeedData from '../../../Data/datatypes.seeds.json';

type PlainObject = Readonly<Record<string, unknown>>;

export type DatatypeSeedField = Pick<
  EntityField,
  'fieldKey' | 'required' | 'array' | 'unique' | 'constraints' | 'order'
>;

export interface DatatypeSeed {
  readonly key: string;
  readonly keyLower: string;
  readonly label: string;
  readonly version: number;
  readonly status: 'draft' | 'published';
  readonly storage: { readonly mode: StorageMode };
  readonly fields: ReadonlyArray<DatatypeSeedField>;
  readonly indexes: ReadonlyArray<EntityIndexSpec>;
  readonly locked: true;
}

type DatatypeSeedLiteral = Readonly<Record<string, unknown>>;

type DatatypeSeedFieldLiteral = Readonly<{
  fieldKey?: unknown;
  required?: unknown;
  array?: unknown;
  unique?: unknown;
  constraints?: unknown;
  order?: unknown;
}>;

type IndexLiteral = Readonly<{
  keys?: unknown;
  options?: unknown;
}>;

type IndexOptionsLiteral = Readonly<{
  unique?: unknown;
  name?: unknown;
  sparse?: unknown;
  partialFilterExpression?: unknown;
}>;

export const DATATYPE_SEEDS: ReadonlyArray<DatatypeSeed> = Object.freeze(
  (() => {
    if (!Array.isArray(rawSeedData)) {
      throw new Error('Datatype seed JSON must be an array.');
    }

    const seen = new Set<string>();

    return rawSeedData.map((entry, index) => {
      const seed = parseSeedLiteral(entry, index);
      const keyLower = normalizeKeyLower(seed.key);

      if (seen.has(keyLower)) {
        throw new Error(
          `Duplicate datatype seed detected for keyLower "${keyLower}" in ${DATATYPES_COLLECTION}.`,
        );
      }
      seen.add(keyLower);

      return Object.freeze({
        key: seed.key,
        keyLower,
        label: seed.label,
        version: seed.version,
        status: seed.status,
        storage: Object.freeze({ mode: seed.storage.mode }) as {
          readonly mode: StorageMode;
        },
        fields: Object.freeze(seed.fields.map(cloneField)),
        indexes: Object.freeze(seed.indexes.map(cloneIndex)),
        locked: true,
      });
    });
  })(),
);

function parseSeedLiteral(
  entry: unknown,
  index: number,
): {
  key: string;
  label: string;
  version: number;
  status: 'draft' | 'published';
  storage: { readonly mode: StorageMode };
  fields: ReadonlyArray<DatatypeSeedField>;
  indexes: ReadonlyArray<EntityIndexSpec>;
} {
  if (!isPlainObject(entry)) {
    throw new Error(`Datatype seed at index ${index} must be an object.`);
  }

  const literal = entry as DatatypeSeedLiteral;
  const rawKey = literal.key;
  if (typeof rawKey !== 'string' || rawKey.trim().length === 0) {
    throw new Error(
      `Datatype seed at index ${index} is missing a string "key".`,
    );
  }
  const key = rawKey.trim();
  if (!isKebabCaseKey(key)) {
    throw new Error(`Datatype seed "${key}" must use kebab-case keys.`);
  }

  const label = literal.label;
  if (typeof label !== 'string' || label.trim().length === 0) {
    throw new Error(`Datatype seed "${key}" is missing a string "label".`);
  }

  const version = literal.version === undefined ? 1 : Number(literal.version);
  if (!Number.isInteger(version) || version <= 0) {
    throw new Error(
      `Datatype seed "${key}" must declare a positive integer version.`,
    );
  }

  const rawStatus = literal.status ?? 'draft';
  if (rawStatus !== 'draft' && rawStatus !== 'published') {
    throw new Error(
      `Datatype seed "${key}" must declare status "draft" or "published".`,
    );
  }
  const status = rawStatus;

  const storageMode = parseStorageMode(literal.storage, key);

  const fields = parseFields(literal.fields, key);
  const indexes = parseIndexes(literal.indexes, key);

  return {
    key,
    label: label.trim(),
    version,
    status,
    storage: { mode: storageMode },
    fields,
    indexes,
  };
}

function parseStorageMode(value: unknown, key: string): StorageMode {
  if (value === undefined) {
    return 'single';
  }
  if (!isPlainObject(value)) {
    throw new Error(`Datatype seed "${key}" storage must be an object.`);
  }

  const mode = value.mode;
  if (typeof mode !== 'string' || !isStorageMode(mode)) {
    throw new Error(
      `Datatype seed "${key}" has invalid storage.mode "${String(mode)}".`,
    );
  }

  return mode;
}

function parseFields(
  value: unknown,
  key: string,
): ReadonlyArray<DatatypeSeedField> {
  if (!Array.isArray(value)) {
    throw new Error(`Datatype seed "${key}" must declare a "fields" array.`);
  }

  return value.map((field, index) => parseField(field, key, index));
}

function parseField(
  field: unknown,
  key: string,
  index: number,
): DatatypeSeedField {
  if (!isPlainObject(field)) {
    throw new Error(
      `Datatype seed "${key}" field at index ${index} must be an object.`,
    );
  }

  const literal = field as DatatypeSeedFieldLiteral;
  const rawFieldKey = literal.fieldKey;
  if (typeof rawFieldKey !== 'string' || rawFieldKey.trim().length === 0) {
    throw new Error(
      `Datatype seed "${key}" field at index ${index} is missing a string "fieldKey".`,
    );
  }
  const fieldKey = rawFieldKey.trim();
  if (!isKebabCaseKey(fieldKey)) {
    throw new Error(
      `Datatype seed "${key}" field "${fieldKey}" must use kebab-case fieldKey values.`,
    );
  }

  const required = literal.required === undefined ? false : literal.required;
  if (typeof required !== 'boolean') {
    throw new Error(
      `Datatype seed "${key}" field "${fieldKey}" must declare boolean "required" when provided.`,
    );
  }

  const array = literal.array === undefined ? false : literal.array;
  if (typeof array !== 'boolean') {
    throw new Error(
      `Datatype seed "${key}" field "${fieldKey}" must declare boolean "array" when provided.`,
    );
  }

  if (literal.unique !== undefined && typeof literal.unique !== 'boolean') {
    throw new Error(
      `Datatype seed "${key}" field "${fieldKey}" must declare boolean "unique" when provided.`,
    );
  }

  if (literal.order !== undefined && typeof literal.order !== 'number') {
    throw new Error(
      `Datatype seed "${key}" field "${fieldKey}" must declare numeric "order" when provided.`,
    );
  }

  if (
    literal.constraints !== undefined &&
    !isPlainObject(literal.constraints)
  ) {
    throw new Error(
      `Datatype seed "${key}" field "${fieldKey}" must declare object "constraints" when provided.`,
    );
  }

  const constraints = literal.constraints
    ? Object.freeze({ ...literal.constraints })
    : undefined;

  return Object.freeze({
    fieldKey,
    required,
    array,
    ...(literal.unique !== undefined ? { unique: literal.unique } : {}),
    ...(constraints ? { constraints } : {}),
    ...(literal.order !== undefined ? { order: literal.order } : {}),
  });
}

function parseIndexes(
  value: unknown,
  key: string,
): ReadonlyArray<EntityIndexSpec> {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error(
      `Datatype seed "${key}" indexes must be an array when provided.`,
    );
  }

  return value.map((idx, index) => parseIndex(idx, key, index));
}

function parseIndex(
  value: unknown,
  key: string,
  index: number,
): EntityIndexSpec {
  if (!isPlainObject(value)) {
    throw new Error(
      `Datatype seed "${key}" index at index ${index} must be an object.`,
    );
  }

  const literal = value as IndexLiteral;
  if (!isPlainObject(literal.keys)) {
    throw new Error(
      `Datatype seed "${key}" index at index ${index} must declare keys.`,
    );
  }

  const keysEntries = Object.entries(literal.keys);
  if (keysEntries.length === 0) {
    throw new Error(
      `Datatype seed "${key}" index at index ${index} must declare at least one key.`,
    );
  }

  const keys: Record<string, 1 | -1 | 'text'> = {};
  for (const [k, v] of keysEntries) {
    if (v !== 1 && v !== -1 && v !== 'text') {
      throw new Error(
        `Datatype seed "${key}" index key "${k}" must be 1, -1, or 'text'.`,
      );
    }
    keys[k] = v;
  }

  let options: EntityIndexSpec['options'];
  if (literal.options !== undefined) {
    if (!isPlainObject(literal.options)) {
      throw new Error(
        `Datatype seed "${key}" index options at index ${index} must be an object.`,
      );
    }
    options = parseIndexOptions(literal.options as IndexOptionsLiteral, key);
  }

  return Object.freeze({
    keys: Object.freeze({ ...keys }),
    ...(options ? { options } : {}),
  });
}

function parseIndexOptions(
  literal: IndexOptionsLiteral,
  key: string,
): EntityIndexSpec['options'] {
  if (literal.unique !== undefined && typeof literal.unique !== 'boolean') {
    throw new Error(
      `Datatype seed "${key}" index option "unique" must be boolean when provided.`,
    );
  }
  if (literal.name !== undefined && typeof literal.name !== 'string') {
    throw new Error(
      `Datatype seed "${key}" index option "name" must be a string when provided.`,
    );
  }
  if (literal.sparse !== undefined && typeof literal.sparse !== 'boolean') {
    throw new Error(
      `Datatype seed "${key}" index option "sparse" must be boolean when provided.`,
    );
  }
  if (
    literal.partialFilterExpression !== undefined &&
    !isPlainObject(literal.partialFilterExpression)
  ) {
    throw new Error(
      `Datatype seed "${key}" index option "partialFilterExpression" must be an object when provided.`,
    );
  }

  return Object.freeze({
    ...(literal.unique !== undefined ? { unique: literal.unique } : {}),
    ...(literal.name !== undefined ? { name: literal.name } : {}),
    ...(literal.sparse !== undefined ? { sparse: literal.sparse } : {}),
    ...(literal.partialFilterExpression
      ? {
          partialFilterExpression: {
            ...literal.partialFilterExpression,
          },
        }
      : {}),
  });
}

function cloneField(field: DatatypeSeedField): DatatypeSeedField {
  return Object.freeze({
    fieldKey: field.fieldKey,
    required: field.required,
    array: field.array,
    ...(field.unique !== undefined ? { unique: field.unique } : {}),
    ...(field.constraints ? { constraints: { ...field.constraints } } : {}),
    ...(field.order !== undefined ? { order: field.order } : {}),
  });
}

function cloneIndex(index: EntityIndexSpec): EntityIndexSpec {
  const options = index.options
    ? Object.freeze({
        ...index.options,
        ...(index.options.partialFilterExpression
          ? {
              partialFilterExpression: {
                ...index.options.partialFilterExpression,
              },
            }
          : {}),
      })
    : undefined;

  return Object.freeze({
    keys: Object.freeze({ ...index.keys }),
    ...(options ? { options } : {}),
  });
}

function isStorageMode(mode: string): mode is StorageMode {
  return mode === 'single' || mode === 'perType';
}

export function isDatatypeSeedKey(key: string): boolean {
  const lower = normalizeKeyLower(key);
  return DATATYPE_SEEDS.some((seed) => seed.keyLower === lower);
}

function isPlainObject(value: unknown): value is PlainObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
