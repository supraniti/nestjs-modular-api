import { Test, TestingModule } from '@nestjs/testing';
import { MongodbModule } from '../mongodb.module';
import { MongodbService } from '../mongodb.service';
import type { Collection, Document, Db } from 'mongodb';
import { closeMongoClient } from '../internal/mongodb.client';
import { MongoInfraBootstrap } from '../../../infra/mongo/mongo.bootstrap';
import { DockerModule } from '../../docker/docker.module';

// Detect CI reliably: CI=true or CI=1 (case-insensitive)
const IS_CI = /^(1|true)$/i.test(process.env.CI ?? '');
const RUN_LOCAL = !IS_CI;

// Give Mongo ample time for first pull/start on local runs.
jest.setTimeout(120_000);

// Wrap the entire suite in a conditional describe.
(RUN_LOCAL ? describe : describe.skip)(
  'MongodbService (local integration)',
  () => {
    let moduleRef: TestingModule | undefined;
    let service: MongodbService;
    let db: Db;
    const testDbName = `modapi_test_${Date.now()}`;
    const testCollName = 'spec_collection';

    beforeAll(async () => {
      // Allow infra bootstrap to start Mongo locally (no effect on CI because infra is gated there).
      if (!process.env.MONGO_AUTO_START) process.env.MONGO_AUTO_START = '1';

      moduleRef = await Test.createTestingModule({
        // IMPORTANT: import DockerModule so DockerService and its DockerClient provider are available
        imports: [MongodbModule, DockerModule],
        providers: [MongoInfraBootstrap],
      }).compile();

      // Ensure the local mongo container/image are present and TCP-ready
      const bootstrap = moduleRef.get(MongoInfraBootstrap);
      await bootstrap.onApplicationBootstrap();

      service = moduleRef.get(MongodbService);

      // Get the test DB handle (this will trigger a real connection)
      db = await service.getDb(testDbName);
    });

    afterAll(async () => {
      try {
        // Clean up the whole test database
        await db?.dropDatabase();
      } catch {
        // ignore cleanup errors
      }

      try {
        await closeMongoClient();
      } catch {
        // ignore cleanup errors
      }

      try {
        await moduleRef?.close();
      } catch {
        // ignore cleanup errors
      }
    });

    it('connects and returns a Db handle for the test database', async () => {
      expect(db).toBeDefined();
      const stats = await service.runCommand(
        { dbStats: 1, scale: 1 },
        testDbName,
      );
      expect(typeof stats).toBe('object');
      expect(stats).toHaveProperty('db', testDbName);
    });

    it('creates a collection and performs basic CRUD', async () => {
      // create collection (idempotent safety: drop if exists)
      const existing = await db
        .listCollections({ name: testCollName })
        .toArray();
      if (existing.length > 0) {
        await db.dropCollection(testCollName);
      }
      await db.createCollection(testCollName);

      const coll: Collection<Document> = await service.getCollection(
        testCollName,
        testDbName,
      );

      // Insert one
      const ins1 = await coll.insertOne({ a: 1, tag: 'first' });
      expect(ins1.acknowledged).toBe(true);

      // Insert many
      const insMany = await coll.insertMany([
        { a: 2 },
        { a: 3 },
        { a: 4, tag: 'fourth' },
      ]);
      expect(insMany.acknowledged).toBe(true);
      expect(insMany.insertedCount).toBe(3);

      // Find
      const docs = await coll.find({}).sort({ a: 1 }).toArray();
      expect(docs.length).toBe(4);
      expect(docs[0]).toHaveProperty('a', 1);

      // Count
      const count = await coll.countDocuments({});
      expect(count).toBe(4);

      // Update one
      const upd = await coll.updateOne({ a: 3 }, { $set: { tag: 'third' } });
      expect(upd.acknowledged).toBe(true);
      expect(upd.matchedCount).toBe(1);
      expect(upd.modifiedCount).toBe(1);

      // Delete many
      const del = await coll.deleteMany({ a: { $gte: 3 } });
      expect(del.acknowledged).toBe(true);
      expect(del.deletedCount).toBeGreaterThanOrEqual(1);

      // Final count check
      const after = await coll.countDocuments({});
      expect(after).toBe(2);
    });

    it('runs raw commands (collStats) successfully', async () => {
      // Ensure the collection exists
      const exists = await db.listCollections({ name: testCollName }).toArray();
      if (exists.length === 0) {
        await db.createCollection(testCollName);
      }
      const res = await service.runCommand(
        { collStats: testCollName, scale: 1 },
        testDbName,
      );
      expect(typeof res).toBe('object');
      expect(res).toHaveProperty('ns'); // namespaced collection name
    });
  },
);
