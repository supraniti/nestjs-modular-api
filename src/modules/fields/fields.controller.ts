import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Query,
  Body,
} from '@nestjs/common';
import { FieldsService } from './fields.service';
import {
  FieldDto,
  ListFieldsResponseDto,
  type FieldKindDto,
} from './dto/ListFields.response.dto';
import { GetFieldRequestDto } from './dto/GetField.request.dto';
import { GetFieldResponseDto } from './dto/GetField.response.dto';
import { CreateFieldRequestDto } from './dto/CreateField.request.dto';
import { CreateFieldResponseDto } from './dto/CreateField.response.dto';
import { UpdateFieldRequestDto } from './dto/UpdateField.request.dto';
import { UpdateFieldResponseDto } from './dto/UpdateField.response.dto';
import { DeleteFieldRequestDto } from './dto/DeleteField.request.dto';
import { DeleteFieldResponseDto } from './dto/DeleteField.response.dto';
import type { FieldDoc, FieldKind } from './internal';
import { AppError } from '../../lib/errors/AppError';

@Controller('api/fields')
export class FieldsController {
  constructor(private readonly fields: FieldsService) {}

  /** GET /api/fields/list */
  @Get('list')
  public async list(): Promise<ListFieldsResponseDto> {
    const docs = await this.fields.list();
    return { fields: docs.map(toFieldDto) };
  }

  /** GET /api/fields/get?key=... */
  @Get('get')
  public async get(
    @Query() query: GetFieldRequestDto,
  ): Promise<GetFieldResponseDto> {
    const doc = await this.fields.getByKey(query.key);
    return { field: doc ? toFieldDto(doc) : null };
  }

  /** POST /api/fields/create */
  @Post('create')
  public async create(
    @Body() body: CreateFieldRequestDto,
  ): Promise<CreateFieldResponseDto> {
    try {
      const kind = body.kind as FieldKind; // service validates with isFieldKind
      const created = await this.fields.create({
        key: body.key,
        label: body.label,
        kind,
      });
      return { field: toFieldDto(created) };
    } catch (e) {
      if (e instanceof AppError) throw new BadRequestException(e.message);
      throw e;
    }
  }

  /** POST /api/fields/update */
  @Post('update')
  public async update(
    @Body() body: UpdateFieldRequestDto,
  ): Promise<UpdateFieldResponseDto> {
    if (body.label === undefined && body.kind === undefined) {
      throw new BadRequestException(
        'At least one of "label" or "kind" must be provided.',
      );
    }
    try {
      const patch: { label?: string; kind?: FieldKind } = {
        label: body.label,
        kind: body.kind as FieldKind | undefined, // service will validate
      };
      const updated = await this.fields.updateByKey(body.key, patch);
      return { field: toFieldDto(updated) };
    } catch (e) {
      if (e instanceof AppError) throw new BadRequestException(e.message);
      throw e;
    }
  }

  /** POST /api/fields/delete */
  @Post('delete')
  public async delete(
    @Body() body: DeleteFieldRequestDto,
  ): Promise<DeleteFieldResponseDto> {
    try {
      const res = await this.fields.deleteByKey(body.key);
      return res;
    } catch (e) {
      if (e instanceof AppError) throw new BadRequestException(e.message);
      throw e;
    }
  }
}

/* ---------------------------
   Mapping helpers
   --------------------------- */
function toFieldDto(doc: FieldDoc): FieldDto {
  return {
    id: doc._id.toHexString(),
    key: doc.key,
    label: doc.label,
    kind: toFieldKindDto(doc.kind),
    locked: !!doc.locked,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

function toFieldKindDto(kind: FieldKind): FieldKindDto {
  switch (kind.type) {
    case 'boolean':
    case 'date':
      return { type: kind.type };
    case 'string':
      return {
        type: 'string',
        constraints: kind.constraints ? { ...kind.constraints } : undefined,
      };
    case 'number':
      return {
        type: 'number',
        constraints: kind.constraints ? { ...kind.constraints } : undefined,
      };
    case 'enum':
      return {
        type: 'enum',
        constraints: kind.constraints ? { ...kind.constraints } : undefined,
      };
  }
}
