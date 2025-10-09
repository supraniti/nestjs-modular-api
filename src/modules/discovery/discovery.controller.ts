import { Controller, Get, Param, BadRequestException } from '@nestjs/common';
import { DiscoveryService } from './discovery.service';
import type { GetManifestResponseDto } from './dto/GetManifest.response.dto';
import type { GetEntitySchemaResponseDto } from './dto/GetEntitySchema.response.dto';
import type { GetEntityRelationsResponseDto } from './dto/GetEntityRelations.response.dto';
import {
  UnknownDatatypeError,
  UnpublishedDatatypeError,
} from '../../lib/errors/EntitiesError';

@Controller('discovery')
export class DiscoveryController {
  constructor(private readonly svc: DiscoveryService) {}

  private mapDomainError(err: unknown): never {
    if (
      err instanceof UnknownDatatypeError ||
      err instanceof UnpublishedDatatypeError
    ) {
      throw new BadRequestException((err as Error).message);
    }
    throw err;
  }

  @Get('manifest')
  public async getManifest(): Promise<GetManifestResponseDto> {
    try {
      const manifest = await this.svc.getManifest();
      return manifest;
    } catch (err) {
      this.mapDomainError(err);
    }
  }

  @Get('entities/:type/schema')
  public async getEntitySchema(
    @Param('type') type: string,
  ): Promise<GetEntitySchemaResponseDto> {
    try {
      const res = await this.svc.getEntitySchemas(type);
      return res;
    } catch (err) {
      this.mapDomainError(err);
    }
  }

  @Get('entities/:type/relations')
  public async getEntityRelations(
    @Param('type') type: string,
  ): Promise<GetEntityRelationsResponseDto> {
    try {
      return await this.svc.getEntityRelations(type);
    } catch (err) {
      this.mapDomainError(err);
    }
  }
}
