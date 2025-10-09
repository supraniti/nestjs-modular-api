import { Injectable } from '@nestjs/common';
import type { HookAction, HookActionId, HookContext } from '../types';

@Injectable()
export class ValidateAction implements HookAction<unknown, unknown> {
  id: HookActionId = 'validate' as unknown as HookActionId;

  run(ctx: HookContext<unknown, unknown>): HookContext<unknown, unknown> {
    // No-op: read payload, return unchanged context
    void ctx.payload;
    return ctx;
  }
}
