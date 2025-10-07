import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
} from '@nestjs/common';
import { DatatypesService } from './datatypes.service';
import type { DataTypeDoc } from './internal';
import { AppError } from '../../lib/errors/AppError';

import type { ListDatatypesResponseDto } from './dto/ListDatatypes.response.dto';
import type { GetDatatypeRequestDto } from './dto/GetDatatype.request.dto';
import type { GetDatatypeResponseDto } from './dto/GetDatatype.response.dto';

import type { CreateDatatypeRequestDto } from './dto/CreateDatatype.request.dto';
import type { CreateDatatypeResponseDto } from './dto/CreateDatatype.response.dto';

import type { AddFieldRequestDto } from './dto/AddField.request.dto';
import type { AddFieldResponseDto } from './dto/AddField.response.dto';

import type { UpdateFieldRequestDto } from './dto/UpdateField.request.dto';
import type { UpdateFieldResponseDto } from './dto/UpdateField.response.dto';

import type { RemoveFieldRequestDto } from './dto/RemoveField.request.dto';
import type { RemoveFieldResponseDto } from './dto/RemoveField.response.dto';

import type { PublishDatatypeRequestDto } from './dto/PublishDatatype.request.dto';
import type { PublishDatatypeResponseDto } from './dto/PublishDatatype.response.dto';

import type { UnpublishDatatypeRequestDto } from './dto/UnpublishDatatype.request.dto';
import type { UnpublishDatatypeResponseDto } from './dto/UnpublishDatatype.response.dto';

/* ────────────── Local mapping helper (no external dep) ────────────── */
function idToHex(id: unknown): string {
  if (id == null) return '';
  if (typeof id === 'string') return id;
  if (
    typeof id === 'number' ||
    typeof id === 'bigint' ||
    typeof id === 'boolean'
  ) {
    return String(id);
  }
  const maybe = id as { toHexString?: () => string };
  return typeof maybe.toHexString === 'function' ? maybe.toHexString() : '';
}

function toDto(doc: DataTypeDoc) {
  return {
    id: idToHex(doc._id),
    key: doc.key,
    label: doc.label,
    version: doc.version,
    status: doc.status,
    storage: doc.storage,
    fields: doc.fields.map((f) => ({
      fieldKey: f.fieldKey,
      required: f.required ?? false,
      array: f.array ?? false,
      unique: f.unique ?? false,
      order: f.order ?? 0,
      constraints: f.constraints,
    })),
    indexes: (doc.indexes ?? []).map((i) => ({
      keys: i.keys,
      options: i.options,
    })),
    locked: doc.locked,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

/** Map domain errors to HTTP 400 for predictable client behavior. */
async function mapHttp<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (e: unknown) {
    if (e instanceof AppError) {
      // You can shape the body here if you prefer { code, message, context }
      throw new BadRequestException(e.message);
    }
    throw e;
  }
}

@Controller('datatypes')
export class DatatypesController {
  constructor(private readonly svc: DatatypesService) {}

  // GET /api/datatypes/list
  @Get('list')
  public async list(): Promise<ListDatatypesResponseDto> {
    return await mapHttp(async () => {
      const docs = await this.svc.list();
      return { datatypes: docs.map(toDto) };
    });
  }

  // GET /api/datatypes/get?key=...
  @Get('get')
  public async get(
    @Query() q: GetDatatypeRequestDto,
  ): Promise<GetDatatypeResponseDto> {
    return await mapHttp(async () => {
      const doc = await this.svc.getByKey(q.key);
      return { datatype: doc ? toDto(doc) : null };
    });
  }

  // POST /api/datatypes/create
  @Post('create')
  @HttpCode(201)
  public async create(
    @Body() body: CreateDatatypeRequestDto,
  ): Promise<CreateDatatypeResponseDto> {
    return await mapHttp(async () => {
      // Normalize storage to satisfy service CreateInput (no undefined mode)
      const storage = body.storage?.mode
        ? { mode: body.storage.mode }
        : undefined;

      const created = await this.svc.create({
        key: body.key,
        label: body.label,
        storage,
        fields:
          body.fields?.map((f) => ({
            fieldKey: f.fieldKey,
            required: f.required ?? false,
            array: f.array ?? false,
            unique: f.unique ?? false,
            order: f.order ?? 0,
            constraints: f.constraints,
          })) ?? [],
        indexes:
          body.indexes?.map((i) => ({
            keys: i.keys,
            options: i.options,
          })) ?? [],
      });
      return { datatype: toDto(created) };
    });
  }

  // POST /api/datatypes/add-field
  @Post('add-field')
  public async addField(
    @Body() body: AddFieldRequestDto,
  ): Promise<AddFieldResponseDto> {
    return await mapHttp(async () => {
      const updated = await this.svc.addField(body.key, {
        fieldKey: body.field.fieldKey,
        required: body.field.required ?? false,
        array: body.field.array ?? false,
        unique: body.field.unique ?? false,
        order: body.field.order ?? 0,
        constraints: body.field.constraints,
      });
      return { datatype: toDto(updated) };
    });
  }

  // POST /api/datatypes/update-field
  @Post('update-field')
  public async updateField(
    @Body() body: UpdateFieldRequestDto,
  ): Promise<UpdateFieldResponseDto> {
    return await mapHttp(async () => {
      const updated = await this.svc.updateField(body.key, body.fieldKey, {
        required: body.patch.required,
        array: body.patch.array,
        unique: body.patch.unique,
        order: body.patch.order,
        constraints: body.patch.constraints,
      });
      return { datatype: toDto(updated) };
    });
  }

  // POST /api/datatypes/remove-field
  @Post('remove-field')
  public async removeField(
    @Body() body: RemoveFieldRequestDto,
  ): Promise<RemoveFieldResponseDto> {
    return await mapHttp(async () => {
      const updated = await this.svc.removeField(body.key, body.fieldKey);
      return { datatype: toDto(updated) };
    });
  }

  // POST /api/datatypes/publish
  @Post('publish')
  public async publish(
    @Body() body: PublishDatatypeRequestDto,
  ): Promise<PublishDatatypeResponseDto> {
    return await mapHttp(async () => {
      const updated = await this.svc.publish(body.key);
      return { datatype: toDto(updated) };
    });
  }

  // POST /api/datatypes/unpublish
  @Post('unpublish')
  public async unpublish(
    @Body() body: UnpublishDatatypeRequestDto,
  ): Promise<UnpublishDatatypeResponseDto> {
    return await mapHttp(async () => {
      const updated = await this.svc.unpublish(body.key);
      return { datatype: toDto(updated) };
    });
  }
}
