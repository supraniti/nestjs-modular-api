/* Response DTOs for listing fields.
 * We keep responses explicit and serialization-friendly (no driver types).
 */

export interface StringConstraintsDto {
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly pattern?: string;
}

export interface NumberConstraintsDto {
  readonly min?: number;
  readonly max?: number;
  readonly integer?: boolean;
}

export interface EnumConstraintsDto {
  readonly values?: ReadonlyArray<string>;
  readonly caseInsensitive?: boolean;
}

export type FieldKindDto =
  | { readonly type: 'string'; readonly constraints?: StringConstraintsDto }
  | { readonly type: 'number'; readonly constraints?: NumberConstraintsDto }
  | { readonly type: 'boolean' }
  | { readonly type: 'date' }
  | { readonly type: 'enum'; readonly constraints?: EnumConstraintsDto };

export class FieldDto {
  /** Mongo ObjectId as hex string */
  readonly id!: string;

  /** Canonical key (kebab-case) */
  readonly key!: string;

  /** Human label */
  readonly label!: string;

  /** Kind + optional constraints */
  readonly kind!: FieldKindDto;

  /** True for seed/baseline fields */
  readonly locked!: boolean;

  /** ISO-8601 timestamps */
  readonly createdAt!: string;
  readonly updatedAt!: string;
}

export class ListFieldsResponseDto {
  readonly fields!: ReadonlyArray<FieldDto>;
}
