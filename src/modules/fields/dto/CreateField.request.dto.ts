import { IsObject, IsString, Matches } from 'class-validator';

/**
 * We accept a generic "kind" object here and validate semantics in the service
 * (using the FieldKind union guards). This keeps DTO validation minimal for Stage 1.
 */
export class CreateFieldRequestDto {
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  readonly key!: string;

  @IsString()
  readonly label!: string;

  @IsObject()
  readonly kind!: Record<string, unknown>;
}
