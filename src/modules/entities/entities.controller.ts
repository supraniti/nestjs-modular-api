import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  BadRequestException,
  HttpCode,
} from '@nestjs/common';
import { EntitiesService } from './entities.service';
import type { ListEntitiesQueryDto } from './dto/ListEntities.request.dto';
import type { GetDatatypeResponseDto } from './dto/GetDatatype.response.dto';
import type { ListEntitiesResponseDto } from './dto/ListEntities.response.dto';
import type { GetEntityRequestDto } from './dto/GetEntity.request.dto';
import type { GetEntityResponseDto } from './dto/GetEntity.response.dto';
import type { CreateEntityRequestDto } from './dto/CreateEntity.request.dto';
import type { CreateEntityResponseDto } from './dto/CreateEntity.response.dto';
import type { UpdateEntityRequestDto } from './dto/UpdateEntity.request.dto';
import type { UpdateEntityResponseDto } from './dto/UpdateEntity.response.dto';
import type { DeleteEntityRequestDto } from './dto/DeleteEntity.request.dto';
import type { DeleteEntityResponseDto } from './dto/DeleteEntity.response.dto';
import {
  UnknownDatatypeError,
  UnpublishedDatatypeError,
  ValidationError,
  UniqueViolationError,
  EntityNotFoundError,
  CollectionResolutionError,
} from '../../lib/errors/EntitiesError';

@Controller('api/entities/:type')
export class EntitiesController {
  constructor(private readonly svc: EntitiesService) {}

  private mapDomainError(err: unknown): never {
    if (
      err instanceof UnknownDatatypeError ||
      err instanceof UnpublishedDatatypeError ||
      err instanceof ValidationError ||
      err instanceof UniqueViolationError ||
      err instanceof EntityNotFoundError ||
      err instanceof CollectionResolutionError
    ) {
      // Use default Nest error body: { statusCode, message, error: 'Bad Request' }
      throw new BadRequestException((err as Error).message);
    }
    throw err;
  }

  /** Return the published datatype definition for :type. */
  @Get('datatype')
  async getDatatype(
    @Param('type') type: string,
  ): Promise<GetDatatypeResponseDto> {
    try {
      return await this.svc.getDatatype(type);
    } catch (err) {
      this.mapDomainError(err);
    }
  }

  /** List entities of :type with simple equality filters, pagination, sorting (querystring). */
  @Get('list')
  async listEntities(
    @Param('type') type: string,
    @Query() query: ListEntitiesQueryDto,
  ): Promise<ListEntitiesResponseDto> {
    try {
      return await this.svc.listEntities(type, query);
    } catch (err) {
      this.mapDomainError(err);
    }
  }

  /** Get a single entity by id (hex string) for :type. */
  @Get('get')
  async getEntity(
    @Param('type') type: string,
    @Query() q: GetEntityRequestDto,
  ): Promise<GetEntityResponseDto> {
    try {
      return await this.svc.getEntity(type, q.id);
    } catch (err) {
      this.mapDomainError(err);
    }
  }

  /** Create an entity of :type. Payload keys must match the datatype fields. */
  @Post('create')
  async createEntity(
    @Param('type') type: string,
    @Body() payload: CreateEntityRequestDto,
  ): Promise<CreateEntityResponseDto> {
    try {
      return await this.svc.createEntity(type, payload);
    } catch (err) {
      this.mapDomainError(err);
    }
  }

  /** Update an entity of :type by id with a partial payload. */
  @Post('update')
  @HttpCode(200)
  async updateEntity(
    @Param('type') type: string,
    @Body() payload: UpdateEntityRequestDto,
  ): Promise<UpdateEntityResponseDto> {
    try {
      return await this.svc.updateEntity(type, payload.id, payload.changes);
    } catch (err) {
      this.mapDomainError(err);
    }
  }

  /** Delete an entity of :type by id. */
  @Post('delete')
  @HttpCode(200)
  async deleteEntity(
    @Param('type') type: string,
    @Body() payload: DeleteEntityRequestDto,
  ): Promise<DeleteEntityResponseDto> {
    try {
      return await this.svc.deleteEntity(type, payload.id);
    } catch (err) {
      this.mapDomainError(err);
    }
  }
}
