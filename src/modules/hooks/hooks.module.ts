import { Module } from '@nestjs/common';
import { HookRegistry } from './hook.registry';
import { HookStore } from './hook.store';
import { HookEngine } from './hook.engine';
import { ValidateAction } from './actions/validate.action';
import { EnrichAction } from './actions/enrich.action';

@Module({
  providers: [
    HookRegistry,
    HookStore,
    HookEngine,
    ValidateAction,
    EnrichAction,
  ],
  exports: [HookRegistry, HookStore, HookEngine],
})
export class HooksModule {}
