import { isKebabCaseKey, normalizeKeyLower } from '@lib/fields';
import type { EntityField, EntityIndexSpec, StorageMode } from '@lib/datatypes';

import rawSeedData from '../../../Data/datatypes.seeds.json';

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

type PlainObject = Readonly<Record<string, unknown>>;

type DatatypeSeedFieldLiteral = Readonly<{
  fieldKey: string;
  required?: boolean;
  array?: boolean;
  unique?: boolean;
  constraints?: PlainObject;
  order?: number;
}>;

type DatatypeSeedLiteral = Readonly<{
  key: string;
  label: string;
  version?: number;
  status?: 'draft' | 'published';
  storage?: Readonly<{ mode?: StorageMode }>;
  fields: ReadonlyArray<DatatypeSeedFieldLiteral>;
  indexes?: ReadonlyArray<
    Readonly<{
      keys: Readonly<Record<string, 1 | -1 | 'text'>>;
      options?: PlainObject;
    }>
  >;
}>;

function assertPlainObject(
  value: unknown,
  context: string,
): asserts value is PlainObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${context} must be a plain object.`);
  }
}

function coerceSeedLiterals(data: unknown): ReadonlyArray<DatatypeSeedLiteral> {
  if (!Array.isArray(data)) {
    throw new Error('Datatype seed JSON must be an array.');
  }

  return data.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`Datatype seed at index ${index} must be an object.`);
    }

    const literal = entry as Partial<DatatypeSeedLiteral>;
    if (typeof literal.key !== 'string' || literal.key.length === 0) {
      throw new Error(
        `Datatype seed at index ${index} is missing a string "key".`,
      );
    }

    if (typeof literal.label !== 'string' || literal.label.length === 0) {
      throw new Error(
        `Datatype seed "${literal.key}" is missing a string "label".`,
      );
    }

    if (!Array.isArray(literal.fields)) {
      throw new Error(
        `Datatype seed "${literal.key}" must declare a "fields" array.`,
      );
    }

    const fields: DatatypeSeedLiteral['fields'] = literal.fields.map(
      (field, fieldIndex) => {
        if (!field || typeof field !== 'object' || Array.isArray(field)) {
          throw new Error(
            `Field at index ${fieldIndex} for seed "${literal.key}" must be an object.`,
          );
        }
        const f = field as DatatypeSeedFieldLiteral;
        if (typeof f.fieldKey !== 'string' || f.fieldKey.length === 0) {
          throw new Error(
            `Field at index ${fieldIndex} for seed "${literal.key}" is missing a string "fieldKey".`,
          );
        }
        if (f.constraints !== undefined) {
          assertPlainObject(
            f.constraints,
            `Field constraints for "${literal.key}"`,
          );
        }
        if (f.order !== undefined && typeof f.order !== 'number') {
          throw new Error(
            `Field "${f.fieldKey}" on seed "${literal.key}" must have a numeric "order" if provided.`,
          );
        }
        return Object.freeze({ ...f });
      },
    );

    const indexes: DatatypeSeedLiteral['indexes'] | undefined =
      literal.indexes?.map((idx, idxIndex) => {
        if (!idx || typeof idx !== 'object' || Array.isArray(idx)) {
          throw new Error(
            `Index at index ${idxIndex} for seed "${literal.key}" must be an object.`,
          );
        }
        const spec = idx as {
          keys?: Record<string, 1 | -1 | 'text'>;
          options?: PlainObject;
        };
        if (!spec.keys || typeof spec.keys !== 'object') {
          throw new Error(
            `Index spec ${idxIndex} for seed "${literal.key}" must define "keys".`,
          );
        }
        if (spec.options !== undefined) {
          assertPlainObject(
            spec.options,
            `Index options for seed "${literal.key}"`,
          );
        }
        return Object.freeze({
          keys: { ...spec.keys },
          options: spec.options ? { ...spec.options } : undefined,
        });
      });

    const version = literal.version === undefined ? 1 : Number(literal.version);
    if (!Number.isInteger(version) || version < 1) {
      throw new Error(
        `Datatype seed "${literal.key}" must have an integer version >= 1.`,
      );
    }

    const status = literal.status ?? 'draft';
    if (status !== 'draft' && status !== 'published') {
      throw new Error(
        `Datatype seed "${literal.key}" has invalid status "${String(status)}".`,
      );
    }

    const storageMode = literal.storage?.mode ?? 'single';
    if (storageMode !== 'single' && storageMode !== 'perType') {
      throw new Error(
        `Datatype seed "${literal.key}" has invalid storage mode "${String(storageMode)}".`,
      );
    }

    return Object.freeze({
      key: literal.key,
      label: literal.label,
      version,
      status,
      storage: { mode: storageMode },
      fields,
      indexes,
    });
  });
}

const BASE_SEEDS: ReadonlyArray<DatatypeSeedLiteral> = Object.freeze(
  coerceSeedLiterals(rawSeedData),
);

export const DATATYPE_SEEDS: ReadonlyArray<DatatypeSeed> = Object.freeze(
  BASE_SEEDS.map((seed) => {
    const key = seed.key;
    if (!isKebabCaseKey(key)) {
      throw new Error(`Invalid datatype seed key (must be kebab-case): ${key}`);
    }

    const fields = Object.freeze(
      seed.fields.map((f, index) => ({
        fieldKey: f.fieldKey,
        required: f.required ?? false,
        array: f.array ?? false,
        unique: f.unique === true ? true : undefined,
        constraints: f.constraints ? { ...f.constraints } : undefined,
        order: f.order !== undefined ? f.order : index,
      })),
    ) as ReadonlyArray<DatatypeSeedField>;

    const indexes = Object.freeze(
      (seed.indexes ?? []).map((idx) => ({
        keys: { ...idx.keys },
        options: idx.options ? { ...idx.options } : undefined,
      })),
    ) as ReadonlyArray<EntityIndexSpec>;

    const normalized: DatatypeSeed = {
      key,
      keyLower: normalizeKeyLower(key),
      label: seed.label,
      version: seed.version,
      status: seed.status,
      storage: { mode: seed.storage.mode },
      fields,
      indexes,
      locked: true,
    };

    return Object.freeze(normalized);
  }),
);

export function isDatatypeSeedKey(key: string): boolean {
  const lower = normalizeKeyLower(key);
  return DATATYPE_SEEDS.some((s) => s.keyLower === lower);
}
