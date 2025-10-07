import { IsString, Matches, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { EntityFieldInputDto } from './CreateDatatype.request.dto';

const KEBAB_RX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class AddFieldRequestDto {
  @IsString()
  @Matches(KEBAB_RX, { message: 'key must be kebab-case' })
  public readonly key!: string;

  @ValidateNested()
  @Type(() => EntityFieldInputDto)
  public readonly field!: EntityFieldInputDto;
}
