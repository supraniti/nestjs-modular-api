import { Controller, Get } from '@nestjs/common';
import { HookStore } from './hook.store';
import type { HookPhase, HookStep } from './types';

@Controller('hooks')
export class HooksController {
  constructor(private readonly store: HookStore) {}

  @Get('manifest')
  getManifest(): {
    types: Array<{
      typeKey: string;
      phases: Partial<Record<HookPhase, HookStep[]>>;
    }>;
  } {
    const items: Array<{
      typeKey: string;
      phases: Partial<Record<HookPhase, HookStep[]>>;
    }> = [];
    const keys: string[] = this.store.listTypes();
    for (const typeKey of keys) {
      const phases: Partial<Record<HookPhase, HookStep[]>> = {};
      for (const phase of [
        'beforeCreate',
        'afterCreate',
        'beforeGet',
        'afterGet',
        'beforeUpdate',
        'afterUpdate',
        'beforeDelete',
        'afterDelete',
        'beforeList',
        'afterList',
      ] as HookPhase[]) {
        const steps = this.store.getFlow(typeKey, phase);
        if (steps.length > 0) phases[phase] = steps;
      }
      items.push({ typeKey, phases });
    }
    return { types: items };
  }
}
