import type { WithId } from 'mongodb';

/**
 * Collection name for field definitions.
 */
export const FIELDS_COLLECTION = 'fields' as const;

/**
 * We use kebab-case for field keys. Example: "title", "created-at".
 * Boolean validator (not a type predicate) to avoid contradictory narrowing.
 */
export function isKebabCaseKey(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

/**
 * Normalize a key for case-insensitive uniqueness.
 * NOTE: We still store the canonical `key` as provided, but we also persist `keyLower`
 * and index it uniquely for fast lookups.
 */
export function normalizeKeyLower(key: string): string {
  return key.toLowerCase();
}

/**
 * Common string/number/enum constraints (Stage 1).
 * We keep these minimal for now; richer validation will arrive in later phases.
 */
export interface StringConstraints {
  readonly minLength?: number;
  readonly maxLength?: number;
  /** A regex *pattern string* (compiled by higher layers when needed). */
  readonly pattern?: string;
}

export interface NumberConstraints {
  readonly min?: number;
  readonly max?: number;
  /** If true, only integers are allowed. */
  readonly integer?: boolean;
}

export interface EnumConstraints {
  /** Allowed enum values (non-empty strings). */
  readonly values: ReadonlyArray<string>;
  /** If true, treat comparisons as case-insensitive (higher layers apply). */
  readonly caseInsensitive?: boolean;
}

/* =========================
 *     Field kind union
 * ========================= */

export type FieldKind =
  | { readonly type: 'string'; readonly constraints?: StringConstraints }
  | { readonly type: 'number'; readonly constraints?: NumberConstraints }
  | { readonly type: 'boolean' }
  | { readonly type: 'date' }
  // NOTE: Allow enum without constraints at definition time (seed); concrete enums
  // for user-defined fields will provide constraints later when used.
  | { readonly type: 'enum'; readonly constraints?: EnumConstraints };

/* =========================
 *   Stored document shapes
 * ========================= */

/** Base shape persisted in the collection (no _id). */
export interface FieldDocBase {
  /** Canonical key (kebab-case), human-editable for custom fields. */
  readonly key: string;
  /** Lowercased key; used for unique index + case-insensitive queries. */
  readonly keyLower: string;
  /** Human label. */
  readonly label: string;
  /** Discriminated union describing the field's kind + constraints. */
  readonly kind: FieldKind;
  /** True for seed/baseline fields; cannot be deleted; updates restricted. */
  readonly locked: boolean;
  /** Timestamps (UTC). */
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Read shape returned by the driver (includes _id). */
export type FieldDoc = WithId<FieldDocBase>;

/**
 * On locked fields, only these props may be updated (Stage 1 policy).
 * Everything else is immutable.
 */
export const LOCKED_MUTABLE_PROPS = ['label'] as const;
export type LockedMutableProp = (typeof LOCKED_MUTABLE_PROPS)[number];

/* =========================
 *   Minimal runtime guards
 * ========================= */

/** Narrow unknown to FieldKind via discriminant + minimal constraint shape checks. */
export function isFieldKind(value: unknown): value is FieldKind {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  const t = v.type;
  if (t === 'boolean' || t === 'date') return true;

  if (t === 'string') {
    const c = v.constraints;
    return c === undefined || isStringConstraints(c);
  }

  if (t === 'number') {
    const c = v.constraints;
    return c === undefined || isNumberConstraints(c);
  }

  if (t === 'enum') {
    const c = v.constraints;
    // Allow undefined for seed baseline; concrete enums validated elsewhere.
    return c === undefined || isEnumConstraints(c);
  }

  return false;
}

export function isStringConstraints(
  value: unknown,
): value is StringConstraints {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  const okMin =
    v.minLength === undefined ||
    (typeof v.minLength === 'number' && Number.isFinite(v.minLength));
  const okMax =
    v.maxLength === undefined ||
    (typeof v.maxLength === 'number' && Number.isFinite(v.maxLength));
  const okPat = v.pattern === undefined || typeof v.pattern === 'string';
  return okMin && okMax && okPat;
}

export function isNumberConstraints(
  value: unknown,
): value is NumberConstraints {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  const okMin =
    v.min === undefined ||
    (typeof v.min === 'number' && Number.isFinite(v.min));
  const okMax =
    v.max === undefined ||
    (typeof v.max === 'number' && Number.isFinite(v.max));
  const okInt = v.integer === undefined || typeof v.integer === 'boolean';
  return okMin && okMax && okInt;
}

export function isEnumConstraints(value: unknown): value is EnumConstraints {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  const values = v.values;
  const okValues =
    Array.isArray(values) &&
    values.length > 0 &&
    values.every((x) => typeof x === 'string' && x.length > 0);
  const okCase =
    v.caseInsensitive === undefined || typeof v.caseInsensitive === 'boolean';
  return okValues && okCase;
}
