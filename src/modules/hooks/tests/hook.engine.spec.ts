import { Test } from '@nestjs/testing';
import { HookEngine } from '../hook.engine';
import { HookRegistry } from '../hook.registry';
import { HookStore } from '../hook.store';
import type { HookAction, HookContext } from '../types';
import { ValidateAction } from '../actions/validate.action';
import { EnrichAction } from '../actions/enrich.action';
import { SchemaRegistry } from '../schema.registry';
import { MongodbService } from '../../mongodb/mongodb.service';
import { NestHookLogger } from '../types';

describe('HookEngine', () => {
  async function makeEngine() {
    const module = await Test.createTestingModule({
      providers: [
        HookStore,
        HookRegistry,
        HookEngine,
        ValidateAction,
        EnrichAction,
        { provide: MongodbService, useValue: { getCollection: jest.fn() } },
        NestHookLogger,
        {
          provide: SchemaRegistry,
          useValue: {
            getCreate: () =>
              Promise.resolve({
                schema: {},
                validate: (() => true) as never,
              }),
            getUpdate: () =>
              Promise.resolve({
                schema: {},
                validate: (() => true) as never,
              }),
          },
        },
      ],
    }).compile();
    return {
      engine: module.get(HookEngine),
      store: module.get(HookStore),
      registry: module.get(HookRegistry),
    } as const;
  }

  it('runs steps in order and state flows through', async () => {
    const { engine, store, registry } = await makeEngine();

    const a1: HookAction = {
      id: 'a1' as unknown as import('../types').HookActionId,
      run: (ctx: HookContext) => ({
        ...ctx,
        meta: {
          ...ctx.meta,
          trace: [...((ctx.meta.trace as string[]) ?? []), 'a1'],
        },
      }),
    };
    const a2: HookAction = {
      id: 'a2' as unknown as import('../types').HookActionId,
      run: (ctx: HookContext) => ({
        ...ctx,
        meta: {
          ...ctx.meta,
          trace: [...((ctx.meta.trace as string[]) ?? []), 'a2'],
        },
      }),
    };

    registry.register(a1);
    registry.register(a2);
    store.applyPatch({
      typeKey: 'article',
      phases: { beforeCreate: [{ action: a1.id }, { action: a2.id }] },
    });

    const res = await engine.run({
      typeKey: 'article',
      phase: 'beforeCreate',
      ctx: { payload: {}, meta: { typeKey: 'article', trace: [] } },
    });

    expect(res.meta.trace).toEqual(['a1', 'a2']);
  });

  it('throws on unknown action id', async () => {
    const { engine, store } = await makeEngine();
    store.applyPatch({
      typeKey: 'article',
      phases: {
        beforeCreate: [
          { action: 'missing' as unknown as import('../types').HookActionId },
        ],
      },
    });

    await expect(
      engine.run({
        typeKey: 'article',
        phase: 'beforeCreate',
        ctx: { payload: {}, meta: { typeKey: 'article' } },
      }),
    ).rejects.toThrow(
      /Unknown action: missing \(phase=beforeCreate, typeKey=article\)/,
    );
  });

  it('propagates action error and decorates message', async () => {
    const { engine, store, registry } = await makeEngine();
    const boom: HookAction = {
      id: 'boom' as unknown as import('../types').HookActionId,
      run: () => {
        throw new Error('boom');
      },
    };
    registry.register(boom);
    store.applyPatch({
      typeKey: 'article',
      phases: { beforeCreate: [{ action: boom.id }] },
    });

    await expect(
      engine.run({
        typeKey: 'article',
        phase: 'beforeCreate',
        ctx: { payload: {}, meta: { typeKey: 'article' } },
      }),
    ).rejects.toThrow(/boom \[beforeCreate\/article\/boom\]/);
  });

  it('exposes step args to the action via ctx.meta.stepArgs', async () => {
    const { engine, store, registry } = await makeEngine();
    const seeArgs: HookAction = {
      id: 'seeArgs' as unknown as import('../types').HookActionId,
      run: (ctx: HookContext) => ({
        ...ctx,
        meta: {
          ...ctx.meta,
          // Record the stepArgs value in trace for visibility
          trace: [...((ctx.meta.trace as unknown[]) ?? []), ctx.meta.stepArgs],
        },
      }),
    };
    registry.register(seeArgs);
    store.applyPatch({
      typeKey: 'article',
      phases: {
        beforeCreate: [{ action: seeArgs.id, args: { with: 'tags' } }],
      },
    });

    const res = await engine.run({
      typeKey: 'article',
      phase: 'beforeCreate',
      ctx: { payload: {}, meta: { typeKey: 'article', trace: [] } },
    });

    expect(res.meta.trace).toHaveLength(1);
    expect(res.meta.trace?.[0]).toEqual({ with: 'tags' });
  });
});
