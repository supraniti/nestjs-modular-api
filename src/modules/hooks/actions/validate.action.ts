import { Injectable } from '@nestjs/common';
import type { HookAction, HookActionId, HookContext } from '../types';
import { SchemaRegistry } from '../schema.registry';
import { ValidationError } from '../../../lib/errors/EntitiesError';

@Injectable()
export class ValidateAction implements HookAction<unknown, unknown> {
  id: HookActionId = 'validate' as unknown as HookActionId;

  constructor(private readonly registry: SchemaRegistry) {}

  async run(
    ctx: HookContext<unknown, unknown>,
  ): Promise<HookContext<unknown, unknown>> {
    const { typeKey, phase } = {
      typeKey: ctx.meta.typeKey,
      phase: ctx.meta['phase'] as string | undefined,
    };
    const payload = ctx.payload;

    // Determine mode by phase; default to create semantics if unknown
    const mode = phase === 'beforeUpdate' ? 'update' : 'create';

    const { validate } =
      mode === 'update'
        ? await this.registry.getUpdate(typeKey)
        : await this.registry.getCreate(typeKey);

    const ok = validate(payload);
    if (!ok) {
      const issues = (validate.errors ?? []).map((e) => ({
        path: e.instancePath || '/',
        keyword: e.keyword,
        message: e.message ?? 'validation error',
      }));
      // Throw domain ValidationError with structured details for controller mapping
      throw new ValidationError(typeKey, {
        phase: phase ?? 'unknown',
        issues,
      });
    }
    return ctx;
  }
}
