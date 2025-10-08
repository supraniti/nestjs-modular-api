// test/modules/datatypes.e2e-spec.ts
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Server } from 'http';

import { AppModule } from '../../src/app.module';
import { MongoInfraBootstrap } from '../../src/infra/mongo/mongo.bootstrap';
import { DockerModule } from '../../src/modules/docker/docker.module';
import type { CreateDatatypeResponseDto } from '../../src/modules/datatypes/dto/CreateDatatype.response.dto';

const IS_CI = /^(1|true)$/i.test(process.env.CI ?? '');
jest.setTimeout(120_000);

(IS_CI ? describe.skip : describe)('Datatypes E2E (local, real Mongo)', () => {
  let app: INestApplication;
  let server: Server;
  const uniqueKey = `article_${Date.now()}`;

  beforeAll(async () => {
    // Ensure the mongo bootstrap can run locally (skip on CI)
    if (!IS_CI) {
      if (!process.env.MONGO_AUTO_START) process.env.MONGO_AUTO_START = '1';
      const bootstrapMod = await Test.createTestingModule({
        imports: [DockerModule],
        providers: [MongoInfraBootstrap],
      }).compile();
      await bootstrapMod.get(MongoInfraBootstrap).onApplicationBootstrap();
      await bootstrapMod.close();
    }

    const modRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = modRef.createNestApplication();
    app.setGlobalPrefix('api'); // important: no leading slash
    await app.init();

    server = app.getHttpServer() as unknown as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a draft datatype (perType) and manages unique index flow', async () => {
    const createRes = await request(server)
      .post('/api/datatypes/create')
      .send({
        key: uniqueKey,
        label: 'Article',
        storage: { mode: 'perType' },
        fields: [
          {
            fieldKey: 'string',
            required: true,
            array: false,
            unique: true,
            order: 0,
          },
          {
            fieldKey: 'number',
            required: false,
            array: false,
            unique: false,
            order: 1,
          },
        ],
        indexes: [{ keys: { createdAt: 1 } }],
      })
      .expect(201);

    const createBody = createRes.body as Readonly<CreateDatatypeResponseDto>;
    expect(createBody.datatype?.key).toBe(uniqueKey);

    // Add new unique scalar field — accept 200/201 (implementation detail)
    await request(server)
      .post('/api/datatypes/add-field')
      .send({
        key: uniqueKey,
        field: {
          fieldKey: 'boolean',
          required: false,
          array: false,
          unique: true,
          order: 2,
        },
      })
      .expect((r) => {
        if (r.status !== 200 && r.status !== 201) {
          throw new Error(`Expected 200/201, got ${r.status}`);
        }
      });

    // Publish then unpublish — accept 200/201 to avoid brittleness
    await request(server)
      .post('/api/datatypes/publish')
      .send({ key: uniqueKey })
      .expect((r) => {
        if (r.status !== 200 && r.status !== 201) {
          throw new Error(`Expected 200/201, got ${r.status}`);
        }
      });

    await request(server)
      .post('/api/datatypes/unpublish')
      .send({ key: uniqueKey })
      .expect((r) => {
        if (r.status !== 200 && r.status !== 201) {
          throw new Error(`Expected 200/201, got ${r.status}`);
        }
      });
  });

  it('rejects unique + array combination as 4xx (not 500)', async () => {
    await request(server)
      .post('/api/datatypes/create')
      .send({
        key: `${uniqueKey}_bad`,
        label: 'Bad',
        storage: { mode: 'perType' },
        fields: [
          {
            fieldKey: 'number',
            required: true,
            array: true,
            unique: true,
            order: 0,
          },
        ],
      })
      .expect((r) => {
        if (r.status < 400 || r.status >= 500) {
          throw new Error(`Expected 4xx, got ${r.status}`);
        }
      });
  });
});
