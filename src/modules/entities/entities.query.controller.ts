import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Query,
  Body,
} from '@nestjs/common';
import type { QueryEntitiesRequestDto } from './dto/QueryEntities.request.dto';
import type { QueryEntitiesResponseDto } from './dto/QueryEntities.response.dto';
import type { PrevalidateRequestDto } from './dto/Prevalidate.request.dto';
import type { PrevalidateResponseDto } from './dto/Prevalidate.response.dto';
import { EntitiesService } from './entities.service';

@Controller('entities')
export class EntitiesQueryController {
  constructor(private readonly svc: EntitiesService) {}

  @Get('query')
  public async query(
    @Query() q: QueryEntitiesRequestDto,
  ): Promise<QueryEntitiesResponseDto> {
    if ((!q.type || typeof q.type !== 'string') as unknown) {
      throw new BadRequestException({
        ok: false,
        error: { code: 'BadQuery', message: 'type required' },
      });
    }
    return await this.svc.queryEntities(q);
  }

  @Post('validate')
  public async prevalidate(
    @Body() body: PrevalidateRequestDto,
  ): Promise<PrevalidateResponseDto> {
    if (!body?.type || !body?.mode) {
      throw new BadRequestException({
        ok: false,
        error: { code: 'BadQuery', message: 'type and mode required' },
      });
    }
    return await this.svc.prevalidate(body);
  }
}
