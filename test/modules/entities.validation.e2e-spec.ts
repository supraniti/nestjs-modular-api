// test/modules/entities.validation.e2e-spec.ts
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { Server } from 'http';
import { ObjectId } from 'mongodb';

import { EntitiesModule } from '../../src/modules/entities/entities.module';
import { MongodbModule } from '../../src/modules/mongodb/mongodb.module';
import { MongodbService } from '../../src/modules/mongodb/mongodb.service';
import { HookStore } from '../../src/modules/hooks/hook.store';
import type { HookActionId } from '../../src/modules/hooks/types';

type ValidationIssue = { path: string; keyword: string; message: string };

const IS_CI = /^(1|true)$/i.test(process.env.CI ?? '');

(IS_CI ? describe.skip : describe)(
  'Entities Validation E2E (hooks + AJV)',
  () => {
    let app: INestApplication;
    let http: Server;
    let mongo: MongodbService;
    let hooks: HookStore;

    const runId = Date.now().toString(36);
    const typeKey = `e2e_validate_${runId}`;
    const typeKeyLower = typeKey.toLowerCase();
    const collectionName = `data_${typeKeyLower}`;

    const datatypeDoc = {
      _id: new ObjectId(),
      key: typeKey,
      keyLower: typeKeyLower,
      label: `E2E ${typeKey}`,
      version: 1,
      status: 'published' as const,
      storage: 'perType' as const,
      fields: [
        {
          key: 'title',
          label: 'Title',
          type: 'string' as const,
          required: true,
          constraints: { minLength: 1, maxLength: 10 },
        },
        {
          key: 'content',
          label: 'Content',
          type: 'string' as const,
          constraints: { minLength: 1 },
        },
      ],
      indexes: [] as Array<unknown>,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    beforeAll(async () => {
      const moduleRef: TestingModule = await Test.createTestingModule({
        imports: [MongodbModule, EntitiesModule],
      }).compile();

      app = moduleRef.createNestApplication();
      app.setGlobalPrefix('api');
      await app.init();

      http = app.getHttpServer() as unknown as Server;
      mongo = app.get(MongodbService);
      hooks = app.get(HookStore);

      // Register validation hooks for this type
      hooks.applyPatch({
        typeKey: typeKeyLower,
        phases: {
          beforeCreate: [{ action: 'validate' as unknown as HookActionId }],
          beforeUpdate: [{ action: 'validate' as unknown as HookActionId }],
        },
      });

      const datatypes =
        await mongo.getCollection<typeof datatypeDoc>('datatypes');
      await datatypes.insertOne(datatypeDoc);
    });

    afterAll(async () => {
      try {
        const datatypes = await mongo.getCollection('datatypes');
        await datatypes.deleteOne({ _id: datatypeDoc._id });
        const db = await mongo.getDb();
        await db
          .collection(collectionName)
          .drop()
          .catch(() => undefined);
      } finally {
        await app.close();
        await mongo.onModuleDestroy();
      }
    });

    it('POST /api/entities/:type/create -> 400 (standardized) for missing required (title)', async () => {
      const res = await request(http)
        .post(`/api/entities/${typeKey}/create`)
        .send({ content: 'Body' })
        .expect(400);

      const body = res.body as {
        error: string;
        message: string;
        details: ValidationIssue[];
      };
      expect(body.error).toBe('ValidationError');
      expect(body.message).toBe('Validation failed');
      expect(Array.isArray(body.details)).toBe(true);
      expect(body.details.some((i) => i.keyword === 'required')).toBe(true);
    });

    let id = '';
    it('POST /api/entities/:type/create -> 201 for valid payload', async () => {
      const res = await request(http)
        .post(`/api/entities/${typeKey}/create`)
        .send({ title: 'Hi', content: 'Body' })
        .expect((s) => [200, 201].includes(s.status));
      id = (res.body as { id: string }).id ?? '';
      expect(id).toHaveLength(24);
    });

    it('POST /api/entities/:type/update -> 400 (standardized) for constraint violation (maxLength)', async () => {
      const res = await request(http)
        .post(`/api/entities/${typeKey}/update`)
        .send({ id, changes: { title: 'This is too long' } })
        .expect(400);

      const body2 = res.body as {
        error: string;
        message: string;
        details: ValidationIssue[];
      };
      expect(body2.error).toBe('ValidationError');
      expect(body2.message).toBe('Validation failed');
      expect(body2.details.some((i) => i.keyword === 'maxLength')).toBe(true);
    });
  },
);
