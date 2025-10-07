import { IsString, Matches } from 'class-validator';

const KEBAB_RX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class PublishDatatypeRequestDto {
  @IsString()
  @Matches(KEBAB_RX, { message: 'key must be kebab-case' })
  public readonly key!: string;
}
