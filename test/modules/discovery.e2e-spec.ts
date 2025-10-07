import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { Server } from 'http';
import { MongodbModule } from '../../src/modules/mongodb/mongodb.module';
import { EntitiesModule } from '../../src/modules/entities/entities.module';
import { DiscoveryModule } from '../../src/modules/discovery/discovery.module';
import { MongodbService } from '../../src/modules/mongodb/mongodb.service';
import { ObjectId } from 'mongodb';

const isCI = process.env.CI === '1' || process.env.CI === 'true';

(!isCI ? describe : describe.skip)('Discovery E2E', () => {
  let app: INestApplication;
  let http: Server;
  let mongo: MongodbService;

  const runId = Date.now().toString(36);
  const typeKey = `e2e_discovery_${runId}`;
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
      { key: 'qty', label: 'Qty', type: 'number' as const },
    ],
    indexes: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  jest.setTimeout(30_000);

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [MongodbModule, EntitiesModule, DiscoveryModule],
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

  it('GET /api/discovery/manifest includes the published type', async () => {
    const res = await request(http).get('/api/discovery/manifest').expect(200);
    type Manifest = import('../../src/lib/types/explorer').ExplorerManifest;
    const body = res.body as Manifest;

    const found = body.modules.entities.types.find((t) => t.key === typeKey);
    expect(found).toBeTruthy();
    expect(found?.schemas.create.properties).toHaveProperty('name');
    expect(found?.routes.find((r) => r.name === 'create')?.path).toBe(
      `/api/entities/${typeKey}/create`,
    );
  });

  it('GET /api/discovery/entities/:type/schema returns schemas for that type', async () => {
    const res = await request(http)
      .get(`/api/discovery/entities/${encodeURIComponent(typeKey)}/schema`)
      .expect(200);

    type SchemaRes =
      import('../../src/modules/discovery/dto/GetEntitySchema.response.dto').GetEntitySchemaResponseDto;
    const body = res.body as SchemaRes;

    expect(body.key).toBe(typeKey);
    expect(body.schemas.create.properties).toHaveProperty('name');
    expect(body.routes.find((r) => r.name === 'list')?.path).toBe(
      `/api/entities/${typeKey}/list`,
    );
  });
});
