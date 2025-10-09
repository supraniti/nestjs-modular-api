import { Injectable } from '@nestjs/common';
import type { HookAction, HookContext } from '../types';

@Injectable()
export class ValidateAction implements HookAction<unknown, unknown> {
  id = 'validate' as const;

  run(ctx: HookContext<unknown, unknown>): HookContext<unknown, unknown> {
    // No-op: read payload, return unchanged context
    void ctx.payload;
    return ctx;
  }
}
