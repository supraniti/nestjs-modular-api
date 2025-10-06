import type { FieldDto } from './ListFields.response.dto';

export class GetFieldResponseDto {
  /** When the key is not found, this will be null. */
  readonly field!: FieldDto | null;
}
