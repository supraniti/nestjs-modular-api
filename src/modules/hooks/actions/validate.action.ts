import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import type { HookAction, HookActionId, HookContext } from '../types';
import { SchemaRegistry } from '../schema.registry';
import { ValidationHttpException } from '../../../lib/errors/ValidationHttpException';
import Ajv from 'ajv';

@Injectable()
export class ValidateAction implements HookAction<unknown, unknown> {
  id: HookActionId = 'validate' as unknown as HookActionId;

  private readonly ajv = new Ajv({
    strict: true,
    allErrors: true,
    useDefaults: false,
  });
  private readonly cache = new Map<
    string,
    ((data: unknown) => boolean) & { errors?: unknown[] }
  >();
  private readonly argsValidator = this.ajv.compile({
    type: 'object',
    additionalProperties: false,
    properties: {
      mode: { type: 'string', enum: ['create', 'update'] },
      allowUnknown: { type: 'boolean' },
      extraSchema: { type: 'object' },
    },
  });

  constructor(private readonly registry: SchemaRegistry) {}

  async run(
    ctx: HookContext<unknown, unknown>,
  ): Promise<HookContext<unknown, unknown>> {
    const typeKey = String(ctx.meta.typeKey);
    const rawPhase = (ctx.meta as Record<string, unknown>)['phase'];
    const phase = typeof rawPhase === 'string' ? rawPhase : '';
    const args = ctx.meta.stepArgs ?? {};

    if (!this.argsValidator(args)) {
      const raw = Array.isArray(this.argsValidator.errors)
        ? this.argsValidator.errors
        : ([] as unknown[]);
      const details = raw.map((x) => {
        const e = x as {
          instancePath?: string;
          keyword?: string;
          message?: string;
        };
        return {
          path: e.instancePath || '/',
          keyword: e.keyword,
          message: e.message ?? 'invalid args',
        };
      });
      throw new ValidationHttpException(details);
    }

    // Determine mode
    let mode = (args['mode'] as 'create' | 'update' | undefined) ?? undefined;
    if (!mode) {
      if (phase === 'beforeCreate') mode = 'create';
      else if (phase === 'beforeUpdate') mode = 'update';
      else {
        throw new HttpException(
          {
            code: 'VALIDATION_ARGS_REQUIRED',
            message: 'mode is required for this phase',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    const allowUnknown = (args['allowUnknown'] as boolean | undefined) === true;
    const extraSchema =
      (args['extraSchema'] as Record<string, unknown> | undefined) ?? undefined;

    const { schema: baseSchema } =
      mode === 'update'
        ? await this.registry.getUpdate(typeKey)
        : await this.registry.getCreate(typeKey);

    const base = JSON.parse(JSON.stringify(baseSchema)) as Record<
      string,
      unknown
    >;
    base['additionalProperties'] = allowUnknown === true;

    const effective: Record<string, unknown> = extraSchema
      ? { allOf: [base, extraSchema] }
      : base;

    const cacheKey = this.makeKey({
      typeKey: typeKey.toLowerCase(),
      mode,
      allowUnknown,
      extra: extraSchema,
    });
    let validate = this.cache.get(cacheKey);
    if (!validate) {
      validate = this.ajv.compile(effective) as unknown as ((
        data: unknown,
      ) => boolean) & { errors?: unknown[] };
      this.cache.set(cacheKey, validate);
    }

    const ok = validate(ctx.payload);
    if (!ok) {
      const raw2 = Array.isArray(
        (validate as unknown as { errors?: unknown[] }).errors,
      )
        ? ((validate as unknown as { errors?: unknown[] }).errors as unknown[])
        : ([] as unknown[]);
      const errors = raw2.map((x) => {
        const e = x as {
          instancePath?: string;
          keyword?: string;
          message?: string;
        };
        return {
          path: e.instancePath || '/',
          message: e.message ?? 'validation error',
          keyword: e.keyword,
        };
      });
      throw new HttpException(
        { code: 'VALIDATION_FAILED', errors },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    return ctx;
  }

  private makeKey(input: {
    typeKey: string;
    mode: 'create' | 'update';
    allowUnknown: boolean;
    extra?: Record<string, unknown>;
  }): string {
    const extra = input.extra ? this.stableStringify(input.extra) : '';
    return `${input.typeKey}:${input.mode}:${input.allowUnknown ? 1 : 0}:${extra}`;
  }

  private stableStringify(value: unknown): string {
    if (value === null || typeof value !== 'object')
      return JSON.stringify(value);
    if (Array.isArray(value))
      return `[${value.map((v) => this.stableStringify(v)).join(',')}]`;
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0),
    );
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${this.stableStringify(v)}`).join(',')}}`;
  }
}
