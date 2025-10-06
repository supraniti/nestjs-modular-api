import { IsOptional, IsObject, IsString, Matches } from 'class-validator';

export class UpdateFieldRequestDto {
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  readonly key!: string;

  @IsOptional()
  @IsString()
  readonly label?: string;

  @IsOptional()
  @IsObject()
  readonly kind?: Record<string, unknown>;
}
