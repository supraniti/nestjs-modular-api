import { Module } from '@nestjs/common';
import { HookRegistry } from './hook.registry';
import { HookStore } from './hook.store';
import { HookEngine } from './hook.engine';
import { ValidateAction } from './actions/validate.action';
import { EnrichAction } from './actions/enrich.action';
import { SchemaRegistry } from './schema.registry';
import { MongodbModule } from '../mongodb/mongodb.module';
import { RequestIdService } from './request-id.service';
import { HooksController } from './hooks.controller';
import { NestHookLogger } from './types';

@Module({
  imports: [MongodbModule],
  controllers: [HooksController],
  providers: [
    HookRegistry,
    HookStore,
    HookEngine,
    NestHookLogger,
    SchemaRegistry,
    ValidateAction,
    EnrichAction,
    RequestIdService,
  ],
  exports: [HookRegistry, HookStore, HookEngine],
})
export class HooksModule {}
