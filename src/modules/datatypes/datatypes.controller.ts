import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import { DatatypesService } from './datatypes.service';
import {
  AddFieldResponseDto,
  CreateDatatypeResponseDto,
  DataTypeDto,
  GetDatatypeResponseDto,
  ListDatatypesResponseDto,
  RemoveFieldResponseDto,
  UpdateFieldResponseDto,
} from './dto/ListDatatypes.response.dto';
import { GetDatatypeRequestDto } from './dto/GetDatatype.request.dto';
import { CreateDatatypeRequestDto } from './dto/CreateDatatype.request.dto';
import { AddFieldRequestDto } from './dto/AddField.request.dto';
import { UpdateFieldRequestDto } from './dto/UpdateField.request.dto';
import { RemoveFieldRequestDto } from './dto/RemoveField.request.dto';
import type { DataTypeDoc } from './internal';
import { AppError } from '../../lib/errors/AppError';

@Controller('datatypes') // NOTE: global prefix '/api' is set by app; don't duplicate it here.
export class DatatypesController {
  constructor(private readonly svc: DatatypesService) {}

  @Get('list')
  public async list(): Promise<ListDatatypesResponseDto> {
    const docs = await this.svc.list();
    return { datatypes: docs.map(toDto) };
  }

  @Get('get')
  public async get(
    @Query() q: GetDatatypeRequestDto,
  ): Promise<GetDatatypeResponseDto> {
    const doc = await this.svc.getByKey(q.key);
    return { datatype: doc ? toDto(doc) : null };
  }

  @Post('create')
  public async create(
    @Body() body: CreateDatatypeRequestDto,
  ): Promise<CreateDatatypeResponseDto> {
    try {
      const created = await this.svc.create(
        {
          key: body.key,
          label: body.label,
          fields: body.fields?.map((f) => ({
            fieldKey: f.fieldKey,
            required: f.required,
            array: f.array,
            unique: f.unique,
            constraints: f.constraints,
            order: f.order,
          })),
          storage: body.storage ? { mode: body.storage.mode } : undefined,
          indexes: body.indexes?.map((i) => ({
            keys: i.keys,
            options: i.options,
          })),
        },
        undefined,
      );
      return { datatype: toDto(created) };
    } catch (e) {
      if (e instanceof AppError) throw new BadRequestException(e.message);
      throw e;
    }
  }

  @Post('add-field')
  public async addField(
    @Body() body: AddFieldRequestDto,
  ): Promise<AddFieldResponseDto> {
    try {
      const updated = await this.svc.addField(body.key, {
        fieldKey: body.field.fieldKey,
        required: body.field.required,
        array: body.field.array,
        unique: body.field.unique,
        constraints: body.field.constraints,
        order: body.field.order,
      });
      return { datatype: toDto(updated) };
    } catch (e) {
      if (e instanceof AppError) throw new BadRequestException(e.message);
      throw e;
    }
  }

  @Post('update-field')
  public async updateField(
    @Body() body: UpdateFieldRequestDto,
  ): Promise<UpdateFieldResponseDto> {
    try {
      const updated = await this.svc.updateField(body.key, body.fieldKey, {
        required: body.patch.required,
        array: body.patch.array,
        unique: body.patch.unique,
        constraints: body.patch.constraints,
        order: body.patch.order,
      });
      return { datatype: toDto(updated) };
    } catch (e) {
      if (e instanceof AppError) throw new BadRequestException(e.message);
      throw e;
    }
  }

  @Post('remove-field')
  public async removeField(
    @Body() body: RemoveFieldRequestDto,
  ): Promise<RemoveFieldResponseDto> {
    try {
      const updated = await this.svc.removeField(body.key, body.fieldKey);
      return { datatype: toDto(updated) };
    } catch (e) {
      if (e instanceof AppError) throw new BadRequestException(e.message);
      throw e;
    }
  }
}

/* ---------------------------
   Mapping helper
   --------------------------- */
function toDto(doc: DataTypeDoc): DataTypeDto {
  return {
    id: doc._id.toHexString(),
    key: doc.key,
    label: doc.label,
    version: doc.version,
    status: doc.status,
    fields: doc.fields.map((f) => ({
      fieldKey: f.fieldKey,
      required: f.required,
      array: f.array,
      unique: f.unique,
      constraints: f.constraints,
      order: f.order,
    })),
    storage: { mode: doc.storage.mode },
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
