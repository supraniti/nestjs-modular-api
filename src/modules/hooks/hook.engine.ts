import { Injectable } from '@nestjs/common';
import type { HookContext, HookPhase, HookStep } from './types';
import { HookError, NestHookLogger, type HookLogger } from './types';
import { HookStore } from './hook.store';
import { HookRegistry } from './hook.registry';

@Injectable()
export class HookEngine {
  private readonly traceLogger: HookLogger;
  constructor(
    private readonly store: HookStore,
    private readonly registry: HookRegistry,
    logger?: NestHookLogger,
  ) {
    this.traceLogger = logger ?? new NestHookLogger();
  }

  async run(params: {
    typeKey: string;
    phase: HookPhase;
    ctx: HookContext<unknown, unknown>;
  }): Promise<HookContext<unknown, unknown>> {
    const { typeKey, phase } = params;
    let ctx: HookContext = {
      ...params.ctx,
      meta: { ...params.ctx.meta, phase },
    };

    const steps = this.store.getFlow(typeKey, phase);
    const startPhase = Date.now();
    let failed = 0;
    for (const step of steps) {
      try {
        ctx = await this.runStep({ typeKey, phase, step, ctx });
      } catch (e) {
        failed += 1;
        throw e;
      }
    }
    const phaseMs = Date.now() - startPhase;
    this.traceLogger.onPhaseEnd?.({
      rid: ctx.meta.reqId,
      typeKey,
      phase,
      steps: steps.length,
      failed,
      ms: phaseMs,
    });
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
      rid: args.ctx.meta.reqId,
      phase,
      typeKey,
      action: String(step.action),
    });
    // Pass a deep-cloned copy of step args to avoid accidental mutation by actions
    const clonedArgs: Record<string, unknown> | undefined = step.args
      ? (JSON.parse(JSON.stringify(step.args)) as unknown as Record<
          string,
          unknown
        >)
      : undefined;
    const nextCtx: HookContext = {
      ...args.ctx,
      meta: { ...args.ctx.meta, stepArgs: clonedArgs },
    };
    const stepStart = Date.now();
    try {
      const out = await action.run(nextCtx);
      this.traceLogger.onStepEnd?.({
        rid: nextCtx.meta.reqId,
        phase,
        typeKey,
        action: String(step.action),
        ms: Date.now() - stepStart,
        ok: true,
      });
      return out;
    } catch (err) {
      const msg = `${(err as Error).message} [${phase}/${typeKey}/${String(step.action)}]`;
      this.traceLogger.onStepEnd?.({
        rid: args.ctx.meta.reqId,
        phase,
        typeKey,
        action: String(step.action),
        ms: Date.now() - stepStart,
        ok: false,
        err: {
          name: (err as Error).name,
          message: (err as Error).message,
          code: (err as unknown as { code?: string })?.code,
        },
      });
      throw new HookError(msg, { cause: err });
    }
  }
}
