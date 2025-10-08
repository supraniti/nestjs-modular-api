// test/app.e2e-spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { MongoInfraBootstrap } from '../src/infra/mongo/mongo.bootstrap';
import { DockerModule } from '../src/modules/docker/docker.module';

jest.setTimeout(120_000);
const IS_CI = /^(1|true)$/i.test(process.env.CI ?? '');

describe('AppController (e2e)', () => {
  let app: INestApplication;
  let httpServer: Server;

  beforeAll(async () => {
    // Ensure Mongo is up for local e2e (skipped on CI by default)
    if (!IS_CI) {
      if (!process.env.MONGO_AUTO_START) process.env.MONGO_AUTO_START = '1';
      const bootstrapMod: TestingModule = await Test.createTestingModule({
        imports: [DockerModule],
        providers: [MongoInfraBootstrap],
      }).compile();

      await bootstrapMod.get(MongoInfraBootstrap).onApplicationBootstrap();
      await bootstrapMod.close();
    }

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Match runtime prefix (main.ts sets it; tests must set it too)
    app.setGlobalPrefix('api');
    await app.init();

    httpServer = app.getHttpServer() as unknown as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  it('/api (GET)', async () => {
    await request(httpServer).get('/api').expect(200).expect('Hello World!');
  });

  it('/api/health (GET)', async () => {
    await request(httpServer)
      .get('/api/health')
      .expect(200)
      .expect({ status: 'ok' });
  });
});
