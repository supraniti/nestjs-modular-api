import type { WithId } from 'mongodb';

/** Mongo collection name for datatype definitions. */
export const DATATYPES_COLLECTION = 'datatypes' as const;

/** Storage strategy for entity instances. */
export type StorageMode = 'single' | 'perType';

/** Per-field composition in a datatype definition. */
export interface EntityField {
  /** Key of a reusable field from `fields.key` (kebab-case). */
  readonly fieldKey: string;
  /** Required at the entity level. */
  readonly required: boolean;
  /** If true, entity value is an array of this field’s type. */
  readonly array: boolean;
  /** Optional formal kind overrides (e.g., references). */
  readonly kind?: Readonly<
    | {
        readonly type: 'ref';
        /** kebab-case datatype key (normalized lower) */
        readonly target: string;
        readonly cardinality?: 'one' | 'many';
        readonly onDelete?: 'restrict' | 'setNull' | 'cascade';
      }
  >;
  /**
   * Enforce uniqueness across entities for this field.
   * Stage 1 rule: forbidden when `array === true`.
   */
  readonly unique?: boolean;
  /**
   * Optional per-datatype constraint overrides (kept opaque in Stage 1).
   * In Stage 2 we’ll generate a validation schema (Zod/Typia) from these.
   */
  readonly constraints?: Readonly<Record<string, unknown>>;
  /** Optional display ordering hint (not enforced). */
  readonly order?: number;
}

/** Optional secondary index definition (safe subset passthrough to Mongo). */
export interface EntityIndexSpec {
  readonly keys: Readonly<Record<string, 1 | -1 | 'text'>>;
  readonly options?: Readonly<{
    unique?: boolean;
    name?: string;
    sparse?: boolean;
    partialFilterExpression?: Readonly<Record<string, unknown>>;
  }>;
}

/** Core datatype document stored in Mongo (driver shape without _id). */
export interface DataTypeDocBase {
  /** Canonical key (kebab-case). */
  readonly key: string;
  /** Normalized for unique lookup (lowercased). */
  readonly keyLower: string;

  /** Human label for the datatype. */
  readonly label: string;

  /** Version number (starts at 1). */
  readonly version: number;

  /** Draft vs. published state (Stage 2A keeps everything as 'draft'). */
  readonly status: 'draft' | 'published';

  /** Field composition. */
  readonly fields: ReadonlyArray<EntityField>;

  /** Optional extra indexes (beyond field-level unique). */
  readonly indexes?: ReadonlyArray<EntityIndexSpec>;

  /** Reserved for future RBAC/UBAC policies (opaque until Stage 3). */
  readonly policies?: unknown;

  /** Hook identifiers (to be resolved by a hooks registry later). */
  readonly hooks?: ReadonlyArray<string>;

  /** Storage strategy for entity instances. */
  readonly storage: { readonly mode: StorageMode };

  /** Reserved for future baseline/seed types; always false in Stage 2A. */
  readonly locked: boolean;

  /** Timestamps. */
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Read shape with ObjectId. */
export type DataTypeDoc = WithId<DataTypeDocBase>;

/** Backing collection name for per-type storage mode. */
export function collectionNameForDatatype(key: string): string {
  return `dt_${key}`;
}

/** Deterministic unique-index name for a composed field. */
export function uniqueIndexName(datatypeKey: string, fieldKey: string): string {
  return `uniq_${datatypeKey}_${fieldKey}`;
}

