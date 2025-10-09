import type { EntityField, EntityIndexSpec, StorageMode } from '@lib/datatypes';
import { DATATYPES_COLLECTION } from '@lib/datatypes';
import { isKebabCaseKey, normalizeKeyLower } from '@lib/fields';

import rawSeedData from '../../../Data/datatypes.seeds.json';

/**
 * Shape of a datatype seed document after normalization (no timestamps/_id yet).
 */
export interface DatatypeSeed {
  readonly key: string;
  readonly keyLower: string;
  readonly label: string;
  readonly status: 'draft' | 'published';
  readonly version: number;
  readonly fields: ReadonlyArray<EntityField>;
  readonly storage: { readonly mode: StorageMode };
  readonly indexes: ReadonlyArray<EntityIndexSpec>;
  readonly locked: true;
}

type DatatypeSeedLiteral = Readonly<{
  key: string;
  label: string;
  status: 'draft' | 'published';
  version: number;
  fields: ReadonlyArray<EntityField>;
  storage: Readonly<{ mode: StorageMode }>;
  indexes: ReadonlyArray<EntityIndexSpec>;
}>;

type FieldLiteral = Readonly<{
  fieldKey: string;
  required: boolean;
  array: boolean;
  unique?: boolean;
  constraints?: Readonly<Record<string, unknown>>;
  order?: number;
}>;

type IndexLiteral = Readonly<{
  keys: Readonly<Record<string, 1 | -1 | 'text'>>;
  options?: Readonly<{
    unique?: boolean;
    name?: string;
    sparse?: boolean;
    partialFilterExpression?: Readonly<Record<string, unknown>>;
  }>;
}>;

function ensureArray<T>(value: unknown, ctx: string): ReadonlyArray<T> {
  if (!Array.isArray(value)) {
    throw new Error(`${ctx} must be an array.`);
  }
  return value as ReadonlyArray<T>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function coerceSeedLiterals(data: unknown): ReadonlyArray<DatatypeSeedLiteral> {
  if (!Array.isArray(data)) {
    throw new Error('Datatype seed JSON must be an array.');
  }

  return data.map((entry, index) => buildSeedLiteral(entry, index));
}

function buildSeedLiteral(entry: unknown, index: number): DatatypeSeedLiteral {
  if (!isPlainObject(entry)) {
    throw new Error(`Datatype seed at index ${index} must be an object.`);
  }

  const rawKey = entry.key;
  if (typeof rawKey !== 'string' || rawKey.trim().length === 0) {
    throw new Error(
      `Datatype seed at index ${index} is missing a string "key".`,
    );
  }
  const key = rawKey.trim();
  if (!isKebabCaseKey(key)) {
    throw new Error(`Datatype seed "${key}" must use kebab-case keys.`);
  }

  const { label, status, version, fields, storage, indexes } = entry;

  if (typeof label !== 'string' || label.trim().length === 0) {
    throw new Error(`Datatype seed "${key}" is missing a string "label".`);
  }

  if (status !== 'draft' && status !== 'published') {
    throw new Error(
      `Datatype seed "${key}" must declare status "draft" or "published".`,
    );
  }

  if (
    typeof version !== 'number' ||
    !Number.isInteger(version) ||
    version <= 0
  ) {
    throw new Error(
      `Datatype seed "${key}" must declare a positive integer version.`,
    );
  }

  const fieldLiterals = ensureArray<FieldLiteral>(
    fields,
    `Datatype seed "${key}" fields`,
  );
  const parsedFields = fieldLiterals.map((field, fieldIndex) =>
    buildField(field, key, fieldIndex),
  );

  if (!storage || !isPlainObject(storage) || typeof storage.mode !== 'string') {
    throw new Error(`Datatype seed "${key}" must declare storage.mode.`);
  }

  if (!isStorageMode(storage.mode)) {
    throw new Error(
      `Datatype seed "${key}" has invalid storage.mode "${String(storage.mode)}".`,
    );
  }

  const storageMode: StorageMode = storage.mode;

  const parsedIndexes = buildIndexes(indexes, key);

  return Object.freeze({
    key,
    label: label.trim(),
    status,
    version,
    fields: parsedFields,
    storage: Object.freeze({ mode: storageMode }),
    indexes: parsedIndexes,
  });
}

function buildField(
  field: FieldLiteral,
  key: string,
  index: number,
): EntityField {
  if (!isPlainObject(field)) {
    throw new Error(
      `Datatype seed "${key}" field at index ${index} must be an object.`,
    );
  }

  const fieldKey = field.fieldKey;
  if (typeof fieldKey !== 'string' || fieldKey.trim().length === 0) {
    throw new Error(
      `Datatype seed "${key}" field at index ${index} is missing a string "fieldKey".`,
    );
  }
  if (!isKebabCaseKey(fieldKey)) {
    throw new Error(
      `Datatype seed "${key}" field "${fieldKey}" must use kebab-case fieldKey values.`,
    );
  }

  if (typeof field.required !== 'boolean') {
    throw new Error(
      `Datatype seed "${key}" field "${fieldKey}" must declare boolean "required".`,
    );
  }
  if (typeof field.array !== 'boolean') {
    throw new Error(
      `Datatype seed "${key}" field "${fieldKey}" must declare boolean "array".`,
    );
  }

  if (field.unique !== undefined && typeof field.unique !== 'boolean') {
    throw new Error(
      `Datatype seed "${key}" field "${fieldKey}" must declare boolean "unique" when provided.`,
    );
  }

  if (field.order !== undefined && typeof field.order !== 'number') {
    throw new Error(
      `Datatype seed "${key}" field "${fieldKey}" must declare numeric "order" when provided.`,
    );
  }

  if (
    field.constraints !== undefined &&
    (!isPlainObject(field.constraints) || Array.isArray(field.constraints))
  ) {
    throw new Error(
      `Datatype seed "${key}" field "${fieldKey}" must declare object "constraints" when provided.`,
    );
  }

  const constraints =
    field.constraints !== undefined
      ? Object.freeze({ ...field.constraints })
      : undefined;

  const normalized: EntityField = Object.freeze({
    fieldKey,
    required: field.required,
    array: field.array,
    unique: field.unique,
    constraints,
    order: field.order,
  });

  return normalized;
}

function buildIndexes(
  indexes: unknown,
  key: string,
): ReadonlyArray<EntityIndexSpec> {
  if (indexes === undefined) return Object.freeze([]);
  const literalIndexes = ensureArray<IndexLiteral>(
    indexes,
    `Datatype seed "${key}" indexes`,
  );
  return Object.freeze(
    literalIndexes.map((idx, index) => {
      if (!isPlainObject(idx)) {
        throw new Error(
          `Datatype seed "${key}" index at index ${index} must be an object.`,
        );
      }

      if (!isPlainObject(idx.keys)) {
        throw new Error(
          `Datatype seed "${key}" index at index ${index} must declare keys.`,
        );
      }

      const keysEntries = Object.entries(idx.keys);
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

      let options: EntityIndexSpec['options'] | undefined;
      if (idx.options !== undefined) {
        if (!isPlainObject(idx.options)) {
          throw new Error(
            `Datatype seed "${key}" index options at index ${index} must be an object.`,
          );
        }
        const opts = idx.options;
        if (opts.unique !== undefined && typeof opts.unique !== 'boolean') {
          throw new Error(
            `Datatype seed "${key}" index option "unique" must be boolean when provided.`,
          );
        }
        if (opts.name !== undefined && typeof opts.name !== 'string') {
          throw new Error(
            `Datatype seed "${key}" index option "name" must be a string when provided.`,
          );
        }
        if (opts.sparse !== undefined && typeof opts.sparse !== 'boolean') {
          throw new Error(
            `Datatype seed "${key}" index option "sparse" must be boolean when provided.`,
          );
        }
        if (
          opts.partialFilterExpression !== undefined &&
          !isPlainObject(opts.partialFilterExpression)
        ) {
          throw new Error(
            `Datatype seed "${key}" index option "partialFilterExpression" must be an object when provided.`,
          );
        }
        options = {
          unique: opts.unique,
          name: opts.name,
          sparse: opts.sparse,
          partialFilterExpression: opts.partialFilterExpression
            ? { ...opts.partialFilterExpression }
            : undefined,
        };
      }

      return Object.freeze({ keys: Object.freeze({ ...keys }), options });
    }),
  );
}

function isStorageMode(mode: string): mode is StorageMode {
  return mode === 'single' || mode === 'perType';
}

const BASE_SEEDS: ReadonlyArray<DatatypeSeedLiteral> = Object.freeze(
  coerceSeedLiterals(rawSeedData),
);

export const DATATYPE_SEEDS: ReadonlyArray<DatatypeSeed> = Object.freeze(
  (() => {
    const seen = new Set<string>();
    return BASE_SEEDS.map((seed) => {
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
        status: seed.status,
        version: seed.version,
        fields: seed.fields.map(cloneField),
        storage: Object.freeze({ mode: seed.storage.mode }),
        indexes: seed.indexes.map(cloneIndex),
        locked: true,
      });
    });
  })(),
);

function cloneField(field: EntityField): EntityField {
  return Object.freeze({
    fieldKey: field.fieldKey,
    required: field.required,
    array: field.array,
    ...(field.unique !== undefined ? { unique: field.unique } : {}),
    ...(field.constraints !== undefined
      ? { constraints: { ...field.constraints } }
      : {}),
    ...(field.order !== undefined ? { order: field.order } : {}),
  });
}

function cloneIndex(index: EntityIndexSpec): EntityIndexSpec {
  const options = index.options
    ? {
        ...index.options,
        ...(index.options.partialFilterExpression
          ? {
              partialFilterExpression: {
                ...index.options.partialFilterExpression,
              },
            }
          : {}),
      }
    : undefined;

  return Object.freeze({
    keys: { ...index.keys },
    ...(options ? { options } : {}),
  });
}

export function isDatatypeSeedKey(key: string): boolean {
  const lower = normalizeKeyLower(key);
  return DATATYPE_SEEDS.some((seed) => seed.keyLower === lower);
}
