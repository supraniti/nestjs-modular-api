import { IsString, Matches } from 'class-validator';

export class DeleteFieldRequestDto {
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  readonly key!: string;
}
