import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const KEBAB_RX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class UpdateFieldPatchDto {
  // NOTE: fieldKey rename is forbidden in Stage 2A (not exposed here).
  @IsOptional()
  @IsBoolean()
  public readonly required?: boolean;

  @IsOptional()
  @IsBoolean()
  public readonly array?: boolean;

  @IsOptional()
  @IsBoolean()
  public readonly unique?: boolean;

  @IsOptional()
  @IsObject()
  public readonly constraints?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(0)
  public readonly order?: number;
}

export class UpdateFieldRequestDto {
  @IsString()
  @Matches(KEBAB_RX, { message: 'key must be kebab-case' })
  public readonly key!: string;

  @IsString()
  @Matches(KEBAB_RX, { message: 'fieldKey must be kebab-case' })
  public readonly fieldKey!: string;

  @ValidateNested()
  @Type(() => UpdateFieldPatchDto)
  public readonly patch!: UpdateFieldPatchDto;
}
