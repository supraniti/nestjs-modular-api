import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Server } from 'http';
import { HealthModule } from '../../src/modules/health/health.module';
import { PingResponseDto } from '../../src/modules/health/dto/Ping.response.dto';
import { InfoResponseDto } from '../../src/modules/health/dto/Info.response.dto';

function isPingResponseDto(x: unknown): x is PingResponseDto {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    o.ok === true &&
    typeof o.timestamp === 'string' &&
    typeof o.epochMs === 'number' &&
    typeof o.uptimeSec === 'number'
  );
}

function isInfoResponseDto(x: unknown): x is InfoResponseDto {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  const statusOk = o.status === 'ok';
  const timestampOk = typeof o.timestamp === 'string';
  const uptimeOk = typeof o.uptimeSec === 'number';
  const pidOk = typeof o.pid === 'number';
  const nodeOk = typeof o.node === 'string';
  const envOk = typeof o.env === 'string';
  const versionOk = o.version === null || typeof o.version === 'string';
  return (
    statusOk && timestampOk && uptimeOk && pidOk && nodeOk && envOk && versionOk
  );
}

describe('HealthModule (e2e)', () => {
  let app: INestApplication;
  let httpServer: Server;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [HealthModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    httpServer = app.getHttpServer() as unknown as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  it('/api/health/ping (GET) returns PingResponseDto', async () => {
    const res = await request(httpServer)
      .get('/api/health/ping')
      .expect(200)
      .expect('Content-Type', /json/);

    const body: unknown = res.body;
    expect(isPingResponseDto(body)).toBe(true);

    const b = body as PingResponseDto;
    expect(b.ok).toBe(true);
    expect(typeof b.timestamp).toBe('string');
    expect(typeof b.epochMs).toBe('number');
    expect(typeof b.uptimeSec).toBe('number');
  });

  it('/api/health/info (GET) returns InfoResponseDto', async () => {
    const res = await request(httpServer)
      .get('/api/health/info')
      .expect(200)
      .expect('Content-Type', /json/);

    const body: unknown = res.body;
    expect(isInfoResponseDto(body)).toBe(true);

    const b = body as InfoResponseDto;
    expect(b.status).toBe('ok');
    expect(typeof b.timestamp).toBe('string');
    expect(typeof b.uptimeSec).toBe('number');
    expect(typeof b.pid).toBe('number');
    expect(typeof b.node).toBe('string');
    expect(typeof b.env).toBe('string');
    expect(b.version === null || typeof b.version === 'string').toBe(true);
  });
});
