import { Injectable, Logger } from '@nestjs/common';

export type HookPhase =
  | 'beforeCreate'
  | 'afterCreate'
  | 'beforeGet'
  | 'afterGet'
  | 'beforeUpdate'
  | 'afterUpdate'
  | 'beforeDelete'
  | 'afterDelete'
  | 'beforeList'
  | 'afterList';

export const HOOK_PHASES: ReadonlyArray<HookPhase> = Object.freeze([
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
]);

export type HookActionId = string & { __brand: 'HookActionId' };

export interface HookMeta {
  typeKey: string;
  user?: unknown;
  reqId?: string;
  now?: Date;
  // Per-step arguments injected by the engine before invoking an action
  stepArgs?: Record<string, unknown>;
  // Allow extensions for tracing, etc.
  [key: string]: unknown;
}

export interface HookContext<TPayload = unknown, TResult = unknown> {
  payload: TPayload;
  result?: TResult;
  meta: HookMeta;
}

export interface HookAction<In = unknown, Out = unknown> {
  id: HookActionId;
  run: (
    ctx: HookContext<In, Out>,
  ) => Promise<HookContext<Out, unknown>> | HookContext<Out, unknown>;
}

export interface HookStep {
  action: HookActionId;
  args?: Record<string, unknown>;
}

export interface HookPatch {
  typeKey: string;
  phases: Partial<Record<HookPhase, HookStep[]>>;
}

export class HookError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'HookError';
    if (options?.cause) {
      Object.defineProperty(this, 'cause', { value: options.cause });
    }
  }
}

export interface HookLogger {
  onStepStart?: (info: {
    phase: HookPhase;
    typeKey: string;
    action: string;
  }) => void;
  onStepEnd?: (info: {
    phase: HookPhase;
    typeKey: string;
    action: string;
  }) => void;
}

@Injectable()
export class NestHookLogger implements HookLogger {
  private readonly logger = new Logger('HookEngine');
  onStepStart(info: { phase: HookPhase; typeKey: string; action: string }) {
    this.logger.debug(`start ${info.phase}/${info.typeKey}/${info.action}`);
  }
  onStepEnd(info: { phase: HookPhase; typeKey: string; action: string }) {
    this.logger.debug(`end   ${info.phase}/${info.typeKey}/${info.action}`);
  }
}
