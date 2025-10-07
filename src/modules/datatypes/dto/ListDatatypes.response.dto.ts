/** Wire-format DTOs for datatypes responses. Kept driver-free & serializable. */

/** Storage strategy reported to clients. */
export type StorageModeDto = 'single' | 'perType';

/** Field entry inside a datatype (composition). */
export interface EntityFieldDto {
  readonly fieldKey: string;
  readonly required: boolean;
  readonly array: boolean;
  readonly unique?: boolean;
  readonly constraints?: Readonly<Record<string, unknown>>;
  readonly order?: number;
}

/** One datatype entry returned to clients. */
export interface DataTypeDto {
  readonly id: string; // ObjectId hex
  readonly key: string;
  readonly label: string;
  readonly version: number;
  readonly status: 'draft' | 'published';
  readonly fields: ReadonlyArray<EntityFieldDto>;
  readonly storage: { readonly mode: StorageModeDto };
  readonly createdAt: string; // ISO
  readonly updatedAt: string; // ISO
}

/** List response. */
export interface ListDatatypesResponseDto {
  readonly datatypes: ReadonlyArray<DataTypeDto>;
}

/** Get-by-key response. */
export interface GetDatatypeResponseDto {
  readonly datatype: DataTypeDto | null;
}

/** Create response. */
export interface CreateDatatypeResponseDto {
  readonly datatype: DataTypeDto;
}

/** Add-field response. */
export interface AddFieldResponseDto {
  readonly datatype: DataTypeDto;
}

/** Update-field response. */
export interface UpdateFieldResponseDto {
  readonly datatype: DataTypeDto;
}

/** Remove-field response. */
export interface RemoveFieldResponseDto {
  readonly datatype: DataTypeDto;
}

/** Publish response (Stage 2B). */
export interface PublishDatatypeResponseDto {
  readonly datatype: DataTypeDto;
}

/** Unpublish response (Stage 2B). */
export interface UnpublishDatatypeResponseDto {
  readonly datatype: DataTypeDto;
}
