import { Matches, IsString } from 'class-validator';

/** GET /api/fields/get?key=... */
export class GetFieldRequestDto {
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  readonly key!: string;
}
