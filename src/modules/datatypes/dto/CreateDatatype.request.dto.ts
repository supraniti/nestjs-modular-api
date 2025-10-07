import {
  IsArray,
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

export class EntityFieldInputDto {
  @IsString()
  @Matches(KEBAB_RX, { message: 'fieldKey must be kebab-case' })
  public readonly fieldKey!: string;

  @IsBoolean()
  public readonly required!: boolean;

  @IsBoolean()
  public readonly array!: boolean;

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

export class StorageInputDto {
  @IsOptional()
  public readonly mode?: 'single' | 'perType';
}

/** Optional index passthrough (safe subset, aligned with EntityIndexSpec). */
export class IndexSpecInputDto {
  @IsObject()
  public readonly keys!: Record<string, 1 | -1 | 'text'>;

  @IsOptional()
  @IsObject()
  public readonly options?: {
    readonly unique?: boolean;
    readonly name?: string;
    readonly sparse?: boolean;
    readonly partialFilterExpression?: Record<string, unknown>;
  };
}

export class CreateDatatypeRequestDto {
  @IsString()
  @Matches(KEBAB_RX, { message: 'key must be kebab-case' })
  public readonly key!: string;

  @IsString()
  public readonly label!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EntityFieldInputDto)
  public readonly fields?: EntityFieldInputDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => StorageInputDto)
  public readonly storage?: StorageInputDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IndexSpecInputDto)
  public readonly indexes?: IndexSpecInputDto[];
}
