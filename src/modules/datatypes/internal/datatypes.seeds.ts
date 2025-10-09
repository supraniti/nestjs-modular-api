import {
  DATATYPES_COLLECTION,
  type EntityField,
  type EntityIndexSpec,
  type StorageMode,
} from '@lib/datatypes';
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
  readonly hooks?: Readonly<
    Partial<Record<HookPhaseLiteral, ReadonlyArray<HookStepLiteral>>>
  >;
  readonly locked: true;
}

type PlainObject = Readonly<Record<string, unknown>>;
type DatatypeSeedLiteral = Readonly<Record<string, unknown>>;

type DatatypeSeedFieldLiteral = Readonly<{
  fieldKey?: unknown;
  required?: unknown;
  array?: unknown;
  unique?: unknown;
  constraints?: unknown;
  order?: unknown;
}>;

type IndexLiteral = Readonly<{ keys?: unknown; options?: unknown }>;
type IndexOptionsLiteral = Readonly<{
  unique?: unknown;
  name?: unknown;
  sparse?: unknown;
  partialFilterExpression?: unknown;
}>;

// Local literal-only types for hooks to avoid import cycles
export type HookPhaseLiteral =
  | 'beforeCreate'
  | 'afterCreate'
  | 'beforeGet'
  | 'afterGet'
  | 'beforeUpdate'
  | 'afterUpdate'
  | 'beforeDelete'
  | 'afterDelete'
  | 'beforeList'
  | 'afterList';

type HookStepLiteral = Readonly<{
  action: string;
  args?: Readonly<Record<string, unknown>>;
}>;

export const DATATYPE_SEEDS: ReadonlyArray<DatatypeSeed> = Object.freeze(
  (() => {
    if (!Array.isArray(rawSeedData)) {
      throw new Error('Datatype seed JSON must be an array.');
    }

    const seen = new Set<string>();

    return rawSeedData.map((entry, index) => {
      const context = `Datatype seed at index ${index}`;
      const seed = parseDatatypeSeedLiteral(entry, context);
      const keyLower = seed.keyLower;

      if (seen.has(keyLower)) {
        throw new Error(
          `Duplicate datatype seed detected for keyLower "${keyLower}" in ${DATATYPES_COLLECTION}.`,
        );
      }
      seen.add(keyLower);

      return seed;
    });
  })(),
);

export function parseDatatypeSeedLiteral(
  entry: unknown,
  context: string,
): DatatypeSeed {
  const parsed = parseSeedLiteral(entry, context);
  return finalizeDatatypeSeed(parsed);
}

function parseSeedLiteral(
  entry: unknown,
  context: string,
): {
  key: string;
  label: string;
  version: number;
  status: 'draft' | 'published';
  storage: { readonly mode: StorageMode };
  fields: ReadonlyArray<EntityField>;
  indexes: ReadonlyArray<EntityIndexSpec>;
  hooks?: Readonly<
    Partial<Record<HookPhaseLiteral, ReadonlyArray<HookStepLiteral>>>
  >;
} {
  if (!isPlainObject(entry)) {
    throw new Error(`${context}: must be an object.`);
  }

  const literal = entry as DatatypeSeedLiteral;

  const rawKey = literal.key;
  if (typeof rawKey !== 'string') {
    throw new Error(`${context}: key must be a string.`);
  }
  const key = rawKey.trim();
  if (key.length === 0) {
    throw new Error(`${context}: key must be a non-empty string.`);
  }
  if (!isKebabCaseKey(key)) {
    throw new Error(`${context}: key "${key}" must use kebab-case.`);
  }

  const keyContext = `${context} "${key}"`;

  const rawLabel = literal.label;
  if (typeof rawLabel !== 'string') {
    throw new Error(`${keyContext}: label must be a string.`);
  }
  const label = rawLabel.trim();
  if (label.length === 0) {
    throw new Error(`${keyContext}: label must be a non-empty string.`);
  }

  const version = literal.version === undefined ? 1 : Number(literal.version);
  if (!Number.isInteger(version) || version <= 0) {
    throw new Error(`${keyContext}: version must be a positive integer.`);
  }

  const rawStatus = literal.status ?? 'draft';
  if (rawStatus !== 'draft' && rawStatus !== 'published') {
    throw new Error(`${keyContext}: status must be "draft" or "published".`);
  }
  const status = rawStatus;

  const storageMode = parseStorageMode(literal.storage, keyContext);
  const fields = parseFields(literal.fields, keyContext);
  const indexes = parseIndexes(literal.indexes, keyContext);
  const hooks = parseHooks(literal.hooks, keyContext);

  return {
    key,
    label,
    version,
    status,
    storage: { mode: storageMode },
    fields,
    indexes,
    ...(hooks ? { hooks } : {}),
  };
}

function parseStorageMode(value: unknown, context: string): StorageMode {
  if (value === undefined) return 'single';
  if (!isPlainObject(value)) {
    throw new Error(`${context}: storage must be an object.`);
  }
  const mode = (value as { mode?: unknown }).mode;
  if (typeof mode !== 'string' || !isStorageMode(mode)) {
    throw new Error(`${context}: storage.mode "${String(mode)}" is invalid.`);
  }
  return mode;
}

function parseFields(
  value: unknown,
  context: string,
): ReadonlyArray<EntityField> {
  if (!Array.isArray(value)) {
    throw new Error(`${context}: fields must be an array.`);
  }
  return value.map((field, index) =>
    parseField(field, `${context} field[${index}]`),
  );
}

function parseField(field: unknown, context: string): EntityField {
  if (!isPlainObject(field)) {
    throw new Error(`${context}: must be an object.`);
  }

  const literal = field as DatatypeSeedFieldLiteral;
  const rawFieldKey = literal.fieldKey;
  if (typeof rawFieldKey !== 'string') {
    throw new Error(`${context}: fieldKey must be a string.`);
  }
  const fieldKey = rawFieldKey.trim();
  if (fieldKey.length === 0) {
    throw new Error(`${context}: fieldKey must be a non-empty string.`);
  }
  if (!isKebabCaseKey(fieldKey)) {
    throw new Error(`${context}: fieldKey must be kebab-case.`);
  }

  const fieldContext = `${context} "${fieldKey}"`;

  const required =
    literal.required === undefined
      ? false
      : (literal.required as unknown as boolean);
  if (typeof required !== 'boolean') {
    throw new Error(`${fieldContext}: required must be boolean.`);
  }

  const array =
    literal.array === undefined ? false : (literal.array as unknown as boolean);
  if (typeof array !== 'boolean') {
    throw new Error(`${fieldContext}: array must be boolean.`);
  }

  if (literal.unique !== undefined && typeof literal.unique !== 'boolean') {
    throw new Error(`${fieldContext}: unique must be boolean when provided.`);
  }

  if (literal.order !== undefined && typeof literal.order !== 'number') {
    throw new Error(`${fieldContext}: order must be a number when provided.`);
  }

  if (
    literal.constraints !== undefined &&
    !isPlainObject(literal.constraints)
  ) {
    throw new Error(
      `${fieldContext}: constraints must be an object when provided.`,
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
  context: string,
): ReadonlyArray<EntityIndexSpec> {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error(`${context}: indexes must be an array when provided.`);
  }
  return value.map((idx, index) =>
    parseIndex(idx, `${context} index[${index}]`),
  );
}

function parseIndex(value: unknown, context: string): EntityIndexSpec {
  if (!isPlainObject(value)) {
    throw new Error(`${context}: must be an object.`);
  }

  const literal = value as IndexLiteral;
  if (!isPlainObject(literal.keys)) {
    throw new Error(`${context}: keys must be an object.`);
  }

  const keysEntries = Object.entries(literal.keys);
  if (keysEntries.length === 0) {
    throw new Error(`${context}: must declare at least one key.`);
  }

  const keys: Record<string, 1 | -1 | 'text'> = {};
  for (const [k, v] of keysEntries) {
    if (v !== 1 && v !== -1 && v !== 'text') {
      throw new Error(`${context}: key "${k}" must be 1, -1, or 'text'.`);
    }
    keys[k] = v;
  }

  let options: EntityIndexSpec['options'];
  if (literal.options !== undefined) {
    if (!isPlainObject(literal.options)) {
      throw new Error(`${context}: options must be an object.`);
    }
    options = parseIndexOptions(
      literal.options as IndexOptionsLiteral,
      context,
    );
  }

  return Object.freeze({
    keys: Object.freeze({ ...keys }),
    ...(options ? { options } : {}),
  });
}

function parseIndexOptions(
  literal: IndexOptionsLiteral,
  context: string,
): EntityIndexSpec['options'] {
  if (literal.unique !== undefined && typeof literal.unique !== 'boolean') {
    throw new Error(`${context}: option "unique" must be boolean.`);
  }
  if (literal.name !== undefined && typeof literal.name !== 'string') {
    throw new Error(`${context}: option "name" must be string.`);
  }
  if (literal.sparse !== undefined && typeof literal.sparse !== 'boolean') {
    throw new Error(`${context}: option "sparse" must be boolean.`);
  }
  if (
    literal.partialFilterExpression !== undefined &&
    !isPlainObject(literal.partialFilterExpression)
  ) {
    throw new Error(
      `${context}: option "partialFilterExpression" must be an object.`,
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

function cloneField(field: EntityField): EntityField {
  return Object.freeze({
    fieldKey: field.fieldKey,
    required: field.required,
    array: field.array,
    ...(field.unique !== undefined ? { unique: field.unique } : {}),
    ...(field.constraints ? { constraints: { ...field.constraints } } : {}),
    ...(field.order !== undefined ? { order: field.order } : {}),
  });
}

function finalizeDatatypeSeed(parsed: {
  key: string;
  label: string;
  version: number;
  status: 'draft' | 'published';
  storage: { readonly mode: StorageMode };
  fields: ReadonlyArray<EntityField>;
  indexes: ReadonlyArray<EntityIndexSpec>;
  hooks?: Readonly<
    Partial<Record<HookPhaseLiteral, ReadonlyArray<HookStepLiteral>>>
  >;
}): DatatypeSeed {
  const keyLower = normalizeKeyLower(parsed.key);

  return Object.freeze({
    key: parsed.key,
    keyLower,
    label: parsed.label,
    version: parsed.version,
    status: parsed.status,
    storage: Object.freeze({ mode: parsed.storage.mode }) as {
      readonly mode: StorageMode;
    },
    fields: Object.freeze(parsed.fields.map(cloneField)),
    indexes: Object.freeze(parsed.indexes.map(cloneIndex)),
    ...(parsed.hooks ? { hooks: freezeHooks(parsed.hooks) } : {}),
    locked: true,
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

function parseHooks(
  value: unknown,
  context: string,
):
  | Readonly<Partial<Record<HookPhaseLiteral, ReadonlyArray<HookStepLiteral>>>>
  | undefined {
  if (value === undefined) return undefined;
  if (!isPlainObject(value)) {
    throw new Error(`${context}: hooks must be an object.`);
  }

  const record: Partial<
    Record<HookPhaseLiteral, ReadonlyArray<HookStepLiteral>>
  > = {};
  for (const [phase, stepsVal] of Object.entries(value)) {
    if (!isValidHookPhase(phase)) {
      throw new Error(`${context}: hooks phase "${phase}" is not supported.`);
    }
    if (!Array.isArray(stepsVal)) {
      throw new Error(
        `${context}: hooks.${phase} must be an array when provided.`,
      );
    }
    const steps: HookStepLiteral[] = stepsVal.map((s, idx) => {
      const stepCtx = `${context} hooks.${phase}[${idx}]`;
      if (!isPlainObject(s)) {
        throw new Error(`${stepCtx}: must be an object.`);
      }
      const action = (s as { action?: unknown }).action;
      if (typeof action !== 'string' || action.trim().length === 0) {
        throw new Error(`${stepCtx}: action must be a non-empty string.`);
      }
      const args = (s as { args?: unknown }).args;
      if (args !== undefined && !isPlainObject(args)) {
        throw new Error(`${stepCtx}: args must be an object when provided.`);
      }
      return Object.freeze({
        action: action.trim(),
        ...(args
          ? { args: Object.freeze({ ...(args as Record<string, unknown>) }) }
          : {}),
      });
    });
    (record as Record<string, unknown>)[phase] = Object.freeze(steps);
  }

  return Object.freeze(record);
}

function isValidHookPhase(value: string): value is HookPhaseLiteral {
  return (
    value === 'beforeCreate' ||
    value === 'afterCreate' ||
    value === 'beforeGet' ||
    value === 'afterGet' ||
    value === 'beforeUpdate' ||
    value === 'afterUpdate' ||
    value === 'beforeDelete' ||
    value === 'afterDelete' ||
    value === 'beforeList' ||
    value === 'afterList'
  );
}

function freezeHooks(
  hooks: Readonly<
    Partial<Record<HookPhaseLiteral, ReadonlyArray<HookStepLiteral>>>
  >,
): Readonly<Partial<Record<HookPhaseLiteral, ReadonlyArray<HookStepLiteral>>>> {
  const out: Partial<Record<HookPhaseLiteral, ReadonlyArray<HookStepLiteral>>> =
    {};
  for (const [phase, steps] of Object.entries(hooks)) {
    if (!isValidHookPhase(phase)) continue;
    out[phase] = Object.freeze(
      (steps ?? []).map((s) =>
        Object.freeze({
          action: s.action,
          ...(s.args ? { args: Object.freeze({ ...s.args }) } : {}),
        }),
      ),
    );
  }
  return Object.freeze(out);
}
