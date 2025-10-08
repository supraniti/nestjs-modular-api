import type { FieldKind } from '@lib/fields';
import { isKebabCaseKey, normalizeKeyLower } from '@lib/fields';

import rawSeedData from '../../../Data/fields.seeds.json' assert { type: 'json' };

function isFieldKindLiteral(value: unknown): value is FieldKind {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as FieldKind).type === 'string'
  );
}

/**
 * Shape of a field seed document before insertion.
 * (No _id / timestamps; those are assigned by the bootstrap when syncing.)
 */
export interface FieldSeed {
  readonly key: string; // kebab-case
  readonly keyLower: string; // normalized for unique index
  readonly label: string;
  readonly kind: FieldKind; // minimal constraints at seed time
  readonly locked: true;
}

type FieldSeedLiteral = Readonly<{
  key: string;
  label: string;
  kind: FieldKind;
}>;

function coerceSeedLiterals(data: unknown): ReadonlyArray<FieldSeedLiteral> {
  if (!Array.isArray(data)) {
    throw new Error('Field seed JSON must be an array.');
  }

  return data.map((entry, index) => {
    if (entry === null || typeof entry !== 'object') {
      throw new Error(`Field seed at index ${index} must be an object.`);
    }

    const { key, label, kind } = entry as Partial<FieldSeedLiteral>;

    if (typeof key !== 'string' || key.length === 0) {
      throw new Error(
        `Field seed at index ${index} is missing a string "key".`,
      );
    }

    if (typeof label !== 'string' || label.length === 0) {
      throw new Error(`Field seed "${key}" is missing a string "label".`);
    }

    if (!isFieldKindLiteral(kind)) {
      throw new Error(
        `Field seed "${key}" must declare a "kind" with a "type".`,
      );
    }

    return Object.freeze({
      key,
      label,
      kind,
    }) as FieldSeedLiteral;
  });
}

/** Define the canonical baseline seed list (Stage 1). */
const BASE_SEEDS: ReadonlyArray<FieldSeedLiteral> = Object.freeze(
  coerceSeedLiterals(rawSeedData),
);

/**
 * Built and validated seed documents.
 * - Ensures kebab-case keys.
 * - Computes keyLower.
 * - Marks all as locked.
 */
export const FIELD_SEEDS: ReadonlyArray<FieldSeed> = Object.freeze(
  BASE_SEEDS.map((s) => {
    const key: string = s.key; // keep a local const to avoid any odd narrowing
    if (!isKebabCaseKey(key)) {
      throw new Error(`Invalid seed key (must be kebab-case): ${key}`);
    }
    const seed: FieldSeed = {
      key,
      keyLower: normalizeKeyLower(key),
      label: s.label,
      kind: s.kind,
      locked: true,
    };
    return seed;
  }),
);

/** Utility to check whether a key belongs to the locked seed set. */
export function isSeedKey(key: string): boolean {
  const lower = normalizeKeyLower(key);
  return FIELD_SEEDS.some((s) => s.keyLower === lower);
}
