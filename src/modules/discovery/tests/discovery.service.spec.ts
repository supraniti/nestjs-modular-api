import { Test, TestingModule } from '@nestjs/testing';
import { DiscoveryService } from '../discovery.service';
import { MongodbService } from '../../mongodb/mongodb.service';
import { EntitiesService } from '../../entities/entities.service';
import { RefIntegrityService } from '../../datatypes/ref-integrity.service';
import type { Collection, Document, ObjectId } from 'mongodb';

type Sort = Record<string, 1 | -1>;

interface MockCursor {
  sort: (s: Sort) => MockCursor;
  skip: (n: number) => MockCursor;
  limit: (n: number) => MockCursor;
  toArray: () => Promise<Record<string, unknown>[]>;
}

function makeCursor(docs: Record<string, unknown>[]): MockCursor {
  const self: MockCursor = {
    sort: jest.fn<MockCursor, [Sort]>((...args: [Sort]) => {
      void args; // mark as used to satisfy no-unused-vars
      return self;
    }),
    skip: jest.fn<MockCursor, [number]>((...n: [number]) => {
      void n;
      return self;
    }),
    limit: jest.fn<MockCursor, [number]>((...n: [number]) => {
      void n;
      return self;
    }),
    toArray: jest.fn<Promise<Record<string, unknown>[]>, []>(async () => {
      await Promise.resolve();
      return docs;
    }),
  };
  return self;
}

type Col = jest.Mocked<
  Pick<
    Collection<Record<string, unknown>>,
    | 'findOne'
    | 'countDocuments'
    | 'find'
    | 'insertOne'
    | 'updateOne'
    | 'deleteOne'
  >
>;

function makeCollection(): Col {
  return {
    findOne: jest.fn(),
    countDocuments: jest.fn(),
    find: jest.fn(),
    insertOne: jest.fn(),
    updateOne: jest.fn(),
    deleteOne: jest.fn(),
  } as unknown as Col;
}

describe('DiscoveryService', () => {
  let svc: DiscoveryService;
  let mongo: { getCollection: jest.Mock };
  let entities: { getDatatype: jest.Mock };
  let datatypesCol: Col;

  beforeEach(async () => {
    datatypesCol = makeCollection();

    mongo = {
      getCollection: jest
        .fn<
          Promise<Collection<Record<string, unknown>>>,
          [string, (string | undefined)?]
        >()
        .mockImplementation(async (name: string) => {
          await Promise.resolve();
          if (name === 'datatypes') {
            return datatypesCol as unknown as Collection<
              Record<string, unknown>
            >;
          }
          // default collection (unused)
          return makeCollection() as unknown as Collection<
            Record<string, unknown>
          >;
        }),
    };

    entities = {
      getDatatype: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DiscoveryService,
        { provide: MongodbService, useValue: mongo },
        { provide: EntitiesService, useValue: entities },
        {
          provide: RefIntegrityService,
          useValue: {
            ensureFromDb: jest.fn().mockResolvedValue(undefined),
            toEdges: () => [],
            getIncoming: () => [],
            getOutgoing: () => [],
          },
        },
      ],
    }).compile();

    svc = module.get(DiscoveryService);
  });

  it('getManifest → aggregates endpoints and published entity types', async () => {
    // one published datatype (perType)
    const dtDoc = {
      _id: {
        toHexString: () => '000000000000000000000001',
      } as unknown as ObjectId,
      key: 'Products',
      keyLower: 'products',
      label: 'Products',
      version: 1,
      status: 'published' as const,
      storage: 'perType' as const,
      fields: [
        { key: 'name', label: 'Name', type: 'string' as const, required: true },
        { key: 'qty', label: 'Qty', type: 'number' as const },
      ],
      createdAt: new Date(0),
      updatedAt: new Date(0),
    };
    datatypesCol.find.mockReturnValueOnce(
      makeCursor([dtDoc as unknown as Document]) as unknown as ReturnType<
        Col['find']
      >,
    );

    const manifest = await svc.getManifest();
    expect(manifest.version).toBe(1);
    expect(manifest.baseUrl).toBe('/api');
    expect(manifest.openapiUrl).toBe('/api/openapi.json');
    expect(Array.isArray(manifest.modules.entities.types)).toBe(true);

    const t = manifest.modules.entities.types[0];
    expect(t.key).toBe('Products');
    expect(t.storage).toBe('perType');
    expect(t.routes.find((r) => r.name === 'create')?.path).toBe(
      '/api/entities/Products/create',
    );
    // schema sanity
    expect(t.schemas.create.type).toBe('object');
    expect(t.schemas.create.properties).toHaveProperty('name');
    expect(t.schemas.entityResponse.properties).toHaveProperty('id');
  });

  it('getEntitySchemas → reuses EntitiesService.getDatatype and returns schemas', async () => {
    entities.getDatatype.mockResolvedValueOnce({
      id: '0000000000000000000000aa',
      key: 'Orders',
      label: 'Orders',
      version: 2,
      status: 'published',
      storage: 'single',
      fields: [
        { key: 'name', label: 'Name', type: 'string' },
        { key: 'active', label: 'Active', type: 'boolean' },
      ],
      indexes: [],
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    });

    const spec = await svc.getEntitySchemas('Orders');
    expect(spec.key).toBe('Orders');
    expect(spec.storage).toBe('single');
    expect(spec.routes.find((r) => r.name === 'list')?.path).toBe(
      '/api/entities/Orders/list',
    );
    expect(spec.schemas.update.type).toBe('object');
    expect(spec.schemas.entityResponse.properties).toHaveProperty('id');
  });
});
