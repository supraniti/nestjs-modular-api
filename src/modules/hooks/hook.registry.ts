import { Injectable } from '@nestjs/common';
import type { HookAction, HookActionId } from './types';
import { EnrichAction } from './actions/enrich.action';
import { ValidateAction } from './actions/validate.action';

@Injectable()
export class HookRegistry {
  private readonly actions = new Map<string, HookAction<unknown, unknown>>();

  constructor(validate: ValidateAction, enrich: EnrichAction) {
    // Pre-register built-ins
    this.register(validate);
    this.register(enrich);
  }

  register(action: HookAction<unknown, unknown>): void {
    const id = action.id as unknown as HookActionId as unknown as string;
    if (this.actions.has(id)) {
      throw new Error(`Duplicate action id: ${id}`);
    }
    this.actions.set(id, action);
  }

  get(id: HookActionId): HookAction<unknown, unknown> | undefined {
    return this.actions.get(id as unknown as string);
  }
}
