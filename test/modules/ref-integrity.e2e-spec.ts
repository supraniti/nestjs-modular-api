// test/modules/ref-integrity.e2e-spec.ts
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { Server } from 'http';
import { MongodbModule } from '../../src/modules/mongodb/mongodb.module';
import { EntitiesModule } from '../../src/modules/entities/entities.module';
import { DiscoveryModule } from '../../src/modules/discovery/discovery.module';
import { MongodbService } from '../../src/modules/mongodb/mongodb.service';
import { ObjectId } from 'mongodb';
import { DockerModule } from '../../src/modules/docker/docker.module';
import { MongoInfraBootstrap } from '../../src/infra/mongo/mongo.bootstrap';

const isCI = process.env.CI === '1' || process.env.CI === 'true';

(!isCI ? describe : describe.skip)('Ref Integrity E2E', () => {
  let app: INestApplication;
  let http: Server;
  let mongo: MongodbService;

  const runId = Date.now().toString(36);
  const authorKey = `e2e_author_${runId}`;
  const postKey = `e2e_post_${runId}`;
  const commentKey = `e2e_comment_${runId}`;
  const tagKey = `e2e_tag_${runId}`;

  const mkDt = (
    key: string,
    fields: any[],
    storage: 'perType' | 'single' = 'perType',
  ) => ({
    _id: new ObjectId(),
    key,
    keyLower: key.toLowerCase(),
    label: key,
    version: 1,
    status: 'published' as const,
    storage,
    fields,
    indexes: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const authorDt = mkDt(authorKey, [
    { key: 'name', label: 'Name', type: 'string', required: true },
  ]);
  const postDt = mkDt(postKey, [
    { key: 'title', label: 'Title', type: 'string', required: true },
    {
      key: 'authorId',
      label: 'Author',
      type: 'string',
      required: false,
      kind: {
        type: 'ref',
        target: authorKey.toLowerCase(),
        cardinality: 'one',
        onDelete: 'restrict',
      },
    },
    {
      key: 'tagIds',
      label: 'Tags',
      type: 'string',
      required: false,
      array: true,
      kind: {
        type: 'ref',
        target: tagKey.toLowerCase(),
        cardinality: 'many',
        onDelete: 'setNull',
      },
    },
  ]);
  const commentDt = mkDt(commentKey, [
    {
      key: 'postId',
      label: 'Post',
      type: 'string',
      required: true,
      kind: {
        type: 'ref',
        target: postKey.toLowerCase(),
        cardinality: 'one',
        onDelete: 'cascade',
      },
    },
    { key: 'body', label: 'Body', type: 'string', required: true },
  ]);
  const tagDt = mkDt(tagKey, [
    { key: 'name', label: 'Name', type: 'string', required: true },
  ]);

  jest.setTimeout(90_000);

  beforeAll(async () => {
    // Ensure Mongo
    if (!isCI) {
      if (!process.env.MONGO_AUTO_START) process.env.MONGO_AUTO_START = '1';
      const bootstrapMod: TestingModule = await Test.createTestingModule({
        imports: [DockerModule],
        providers: [MongoInfraBootstrap],
      }).compile();
      await bootstrapMod.get(MongoInfraBootstrap).onApplicationBootstrap();
      await bootstrapMod.close();
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [MongodbModule, EntitiesModule, DiscoveryModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    http = app.getHttpServer() as Server;
    mongo = app.get(MongodbService);

    const datatypes = await mongo.getCollection('datatypes');
    await datatypes.insertMany([authorDt, postDt, commentDt, tagDt]);
  });

  afterAll(async () => {
    try {
      const datatypes = await mongo.getCollection('datatypes');
      await datatypes.deleteMany({
        key: { $in: [authorKey, postKey, commentKey, tagKey] },
      });
      const db = await mongo.getDb();
      await db
        .collection(`data_${authorKey.toLowerCase()}`)
        .drop()
        .catch(() => undefined);
      await db
        .collection(`data_${postKey.toLowerCase()}`)
        .drop()
        .catch(() => undefined);
      await db
        .collection(`data_${commentKey.toLowerCase()}`)
        .drop()
        .catch(() => undefined);
      await db
        .collection(`data_${tagKey.toLowerCase()}`)
        .drop()
        .catch(() => undefined);
    } finally {
      await app.close();
      await mongo.onModuleDestroy();
    }
  });

  it('create post with non-existent authorId -> 400 RefMissing', async () => {
    const fakeId = new ObjectId().toHexString();
    const res = await request(http)
      .post(`/api/entities/${postKey}/create`)
      .send({ title: 'Hello', authorId: fakeId })
      .expect(400);
    expect(res.body).toEqual(expect.objectContaining({ code: 'RefMissing' }));
  });

  it('valid create + cascade/setNull/delete flows', async () => {
    // Create author
    const a = await request(http)
      .post(`/api/entities/${authorKey}/create`)
      .send({ name: 'A1' })
      .expect(201);
    type CreateRes =
      import('../../src/modules/entities/dto/CreateEntity.response.dto').CreateEntityResponseDto;
    const authorId = (a.body as CreateRes).id;

    // Create tags
    const t1 = await request(http)
      .post(`/api/entities/${tagKey}/create`)
      .send({ name: 'T1' })
      .expect(201);
    const tag1 = (t1.body as CreateRes).id;
    const t2 = await request(http)
      .post(`/api/entities/${tagKey}/create`)
      .send({ name: 'T2' })
      .expect(201);
    const tag2 = (t2.body as CreateRes).id;

    // Create post
    const p = await request(http)
      .post(`/api/entities/${postKey}/create`)
      .send({ title: 'P1', authorId, tagIds: [tag1, tag2] })
      .expect(201);
    const postId = (p.body as CreateRes).id;

    // Create comment referencing post
    const c = await request(http)
      .post(`/api/entities/${commentKey}/create`)
      .send({ postId, body: 'C1' })
      .expect(201);
    const commentId = (c.body as CreateRes).id;
    expect(commentId).toBeTruthy();

    // Delete author with existing posts -> 409 (restrict)
    await request(http)
      .post(`/api/entities/${authorKey}/delete`)
      .send({ id: authorId })
      .expect(409);

    // Delete post -> cascade removes comments
    await request(http)
      .post(`/api/entities/${postKey}/delete`)
      .send({ id: postId })
      .expect(200);
    await request(http)
      .get(
        `/api/entities/${commentKey}/get?id=${encodeURIComponent(commentId)}`,
      )
      .expect(400); // not found

    // Delete tag -> setNull/pull removes from posts (no posts left, but should not error)
    await request(http)
      .post(`/api/entities/${tagKey}/delete`)
      .send({ id: tag1 })
      .expect(200);

    // Now delete author (posts cleared)
    await request(http)
      .post(`/api/entities/${authorKey}/delete`)
      .send({ id: authorId })
      .expect(200);
  });
});
