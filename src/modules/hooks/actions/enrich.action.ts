import { Injectable } from '@nestjs/common';
import type { HookAction, HookActionId, HookContext } from '../types';

@Injectable()
export class EnrichAction implements HookAction<unknown, unknown> {
  id: HookActionId = 'enrich' as unknown as HookActionId;

  run(ctx: HookContext<unknown, unknown>): HookContext<unknown, unknown> {
    // No-op by default
    return ctx;
  }
}
