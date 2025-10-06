// test/app.e2e-spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication;
  let httpServer: Server;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    // Explicitly type httpServer to avoid "any" warnings
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
