import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { Server } from 'http';

import { HooksModule } from '../..//src/modules/hooks/hooks.module';
import { HookStore } from '../../src/modules/hooks/hook.store';
import type { HookActionId } from '../../src/modules/hooks/types';

describe('Hooks Manifest E2E', () => {
  let app: INestApplication;
  let http: Server;
  let store: HookStore;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [HooksModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    http = app.getHttpServer() as unknown as Server;
    store = app.get(HookStore);

    store.applyPatch({
      typeKey: 'mf-posts',
      phases: {
        beforeCreate: [{ action: 'validate' as unknown as HookActionId }],
        beforeUpdate: [{ action: 'validate' as unknown as HookActionId }],
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/hooks/manifest returns flows', async () => {
    const res = await request(http).get('/api/hooks/manifest').expect(200);
    const body = res.body as {
      types: Array<{ typeKey: string; phases: Record<string, unknown[]> }>;
    };
    expect(Array.isArray(body.types)).toBe(true);
    expect(body.types.some((t) => t.typeKey === 'mf-posts')).toBe(true);
    const entry = body.types.find((t) => t.typeKey === 'mf-posts');
    expect(entry?.phases?.beforeCreate?.length).toBe(1);
  });
});
