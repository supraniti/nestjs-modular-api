import { Injectable } from '@nestjs/common';
import type { HookContext, HookPhase, HookStep } from './types';
import { HookError, NestHookLogger } from './types';
import { HookStore } from './hook.store';
import { HookRegistry } from './hook.registry';

@Injectable()
export class HookEngine {
  private readonly traceLogger = new NestHookLogger();
  constructor(
    private readonly store: HookStore,
    private readonly registry: HookRegistry,
  ) {}

  async run(params: {
    typeKey: string;
    phase: HookPhase;
    ctx: HookContext<unknown, unknown>;
  }): Promise<HookContext<unknown, unknown>> {
    const { typeKey, phase } = params;
    let ctx = params.ctx;

    const steps = this.store.getFlow(typeKey, phase);
    for (const step of steps) {
      ctx = await this.runStep({ typeKey, phase, step, ctx });
    }
    return ctx;
  }

  private async runStep(args: {
    typeKey: string;
    phase: HookPhase;
    step: HookStep;
    ctx: HookContext<unknown, unknown>;
  }): Promise<HookContext<unknown, unknown>> {
    const { typeKey, phase, step } = args;
    const action = this.registry.get(step.action);
    if (!action) {
      throw new Error(
        `Unknown action: ${String(step.action)} (phase=${phase}, typeKey=${typeKey})`,
      );
    }

    this.traceLogger.onStepStart?.({
      phase,
      typeKey,
      action: String(step.action),
    });
    const nextCtx: HookContext = {
      ...args.ctx,
      meta: { ...args.ctx.meta, stepArgs: step.args },
    };
    try {
      const out = await action.run(nextCtx);
      this.traceLogger.onStepEnd?.({
        phase,
        typeKey,
        action: String(step.action),
      });
      return out;
    } catch (err) {
      const msg = `${(err as Error).message} [${phase}/${typeKey}/${String(step.action)}]`;
      throw new HookError(msg, { cause: err });
    }
  }
}
