import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { EntitiesModule } from '../../src/modules/entities/entities.module';
import { MongodbModule } from '../../src/modules/mongodb/mongodb.module';
import { MongodbService } from '../../src/modules/mongodb/mongodb.service';
import { ObjectId } from 'mongodb';
import type { Server } from 'http';

import type { GetDatatypeResponseDto } from '../../src/modules/entities/dto/GetDatatype.response.dto';
import type { CreateEntityResponseDto } from '../../src/modules/entities/dto/CreateEntity.response.dto';
import type { GetEntityResponseDto } from '../../src/modules/entities/dto/GetEntity.response.dto';
import type { ListEntitiesResponseDto } from '../../src/modules/entities/dto/ListEntities.response.dto';
import type { UpdateEntityResponseDto } from '../../src/modules/entities/dto/UpdateEntity.response.dto';
import type { DeleteEntityResponseDto } from '../../src/modules/entities/dto/DeleteEntity.response.dto';

const isCI = process.env.CI === '1' || process.env.CI === 'true';

(!isCI ? describe : describe.skip)('Entities E2E (perType storage)', () => {
  let app: INestApplication;
  let http: Server;
  let mongo: MongodbService;

  const runId = Date.now().toString(36);
  const typeKey = `e2e_entities_${runId}`;
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
      { key: 'name', label: 'Name', type: 'string' as const, required: true },
      { key: 'sku', label: 'SKU', type: 'string' as const, unique: true },
      { key: 'qty', label: 'Qty', type: 'number' as const },
      { key: 'active', label: 'Active', type: 'boolean' as const },
    ],
    indexes: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  jest.setTimeout(30_000);

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [MongodbModule, EntitiesModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    http = app.getHttpServer() as Server;
    mongo = app.get(MongodbService);

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

  it('GET /api/entities/:type/datatype returns the published datatype', async () => {
    const res = await request(http)
      .get(`/api/entities/${typeKey}/datatype`)
      .expect(200);
    const body = res.body as GetDatatypeResponseDto;
    expect(body.key).toBe(typeKey);
    expect(body.status).toBe('published');
    expect(body.storage).toBe('perType');
    expect(Array.isArray(body.fields)).toBe(true);
  });

  let createdId = '';
  it('POST /api/entities/:type/create creates an entity (valid payload)', async () => {
    const payload = {
      name: 'Alpha',
      sku: `SKU-${runId}`,
      qty: 5,
      active: true,
    };
    const res = await request(http)
      .post(`/api/entities/${typeKey}/create`)
      .send(payload);
    expect([200, 201]).toContain(res.status);
    const body = res.body as CreateEntityResponseDto;
    expect(typeof body.id).toBe('string');
    expect(body.id).toHaveLength(24);
    createdId = body.id;
  });

  it('GET /api/entities/:type/get?id=... fetches the entity', async () => {
    const res = await request(http)
      .get(`/api/entities/${typeKey}/get`)
      .query({ id: createdId })
      .expect(200);

    const body = res.body as GetEntityResponseDto;
    expect(body.id).toBe(createdId);
    expect((body as Record<string, unknown>)['name']).toBe('Alpha');
    expect((body as Record<string, unknown>)['sku']).toBe(`SKU-${runId}`);
  });

  it('GET /api/entities/:type/list returns the entity in pagination', async () => {
    const res = await request(http)
      .get(`/api/entities/${typeKey}/list`)
      .query({ page: 1, pageSize: 10, sortBy: '_id', sortDir: 'asc' })
      .expect(200);

    const body = res.body as ListEntitiesResponseDto;
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.total).toBeGreaterThanOrEqual(1);
    const match = body.items.find((x) => x.id === createdId);
    expect(match).toBeTruthy();
  });

  it('POST /api/entities/:type/update updates the entity (partial)', async () => {
    const res = await request(http)
      .post(`/api/entities/${typeKey}/update`)
      .send({ id: createdId, changes: { name: 'Beta', qty: 9 } })
      .expect(200);

    const body = res.body as UpdateEntityResponseDto;
    expect(body.id).toBe(createdId);
    expect((body as Record<string, unknown>)['name']).toBe('Beta');
    expect((body as Record<string, unknown>)['qty']).toBe(9);
  });

  it('POST /api/entities/:type/create rejects duplicate unique field (sku)', async () => {
    const dup = await request(http)
      .post(`/api/entities/${typeKey}/create`)
      .send({ name: 'Gamma', sku: `SKU-${runId}`, qty: 1 })
      .expect(400);

    const body = dup.body as { message: string; error: string };
    expect(body).toHaveProperty('message');
    expect(body).toHaveProperty('error', 'Bad Request');
  });

  it('POST /api/entities/:type/delete removes the entity', async () => {
    const del = await request(http)
      .post(`/api/entities/${typeKey}/delete`)
      .send({ id: createdId })
      .expect(200);

    const body = del.body as DeleteEntityResponseDto;
    expect(body.deleted).toBe(true);
  });

  it('GET /api/entities/:type/get after delete -> 400 (EntityNotFound)', async () => {
    const res = await request(http)
      .get(`/api/entities/${typeKey}/get`)
      .query({ id: createdId })
      .expect(400);

    const body = res.body as { message: string; error: string };
    expect(body).toHaveProperty('message');
    expect(body).toHaveProperty('error', 'Bad Request');
  });
});
