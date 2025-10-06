import type { FieldKind } from './fields.types';
import { isKebabCaseKey, normalizeKeyLower } from './fields.types';

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

/** Define the canonical baseline seed list (Stage 1). */
const BASE_SEEDS: ReadonlyArray<Pick<FieldSeed, 'key' | 'label' | 'kind'>> =
  Object.freeze([
    { key: 'string', label: 'String', kind: { type: 'string' } },
    { key: 'number', label: 'Number', kind: { type: 'number' } },
    { key: 'boolean', label: 'Boolean', kind: { type: 'boolean' } },
    { key: 'date', label: 'Date', kind: { type: 'date' } },
    // Enum allowed without concrete values at seed time; user-defined enums will add constraints.
    { key: 'enum', label: 'Enum', kind: { type: 'enum' } },
  ]);

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
