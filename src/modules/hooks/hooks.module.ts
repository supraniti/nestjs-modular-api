import { Module } from '@nestjs/common';
import { HookRegistry } from './hook.registry';
import { HookStore } from './hook.store';
import { HookEngine } from './hook.engine';
import { ValidateAction } from './actions/validate.action';
import { EnrichAction } from './actions/enrich.action';
import { SchemaRegistry } from './schema.registry';
import { MongodbModule } from '../mongodb/mongodb.module';

@Module({
  imports: [MongodbModule],
  providers: [
    HookRegistry,
    HookStore,
    HookEngine,
    SchemaRegistry,
    ValidateAction,
    EnrichAction,
  ],
  exports: [HookRegistry, HookStore, HookEngine],
})
export class HooksModule {}
