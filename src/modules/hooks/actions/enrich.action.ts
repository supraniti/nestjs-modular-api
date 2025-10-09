import { Injectable } from '@nestjs/common';
import type { HookAction, HookContext } from '../types';

@Injectable()
export class EnrichAction implements HookAction<unknown, unknown> {
  id = 'enrich' as const;

  run(ctx: HookContext<unknown, unknown>): HookContext<unknown, unknown> {
    // No-op by default
    return ctx;
  }
}
