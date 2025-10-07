import { Test, TestingModule } from '@nestjs/testing';
import { EntitiesService } from '../entities.service';
import { MongodbService } from '../../mongodb/mongodb.service';
import {
  UnknownDatatypeError,
  UnpublishedDatatypeError,
  EntityNotFoundError,
  ValidationError,
  UniqueViolationError,
} from '../../../lib/errors/EntitiesError';
import { ObjectId, type Collection, type Document } from 'mongodb';

/* -----------------------------
   Typed helpers & mock builders
   ----------------------------- */

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
      void args;
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

/* -----------------------------
   Test suite
   ----------------------------- */

describe('EntitiesService', () => {
  let svc: EntitiesService;
  let mongo: { getCollection: jest.Mock };
  let datatypesCol: Col;
  let entitiesCol: Col;

  beforeEach(async () => {
    datatypesCol = makeCollection();
    entitiesCol = makeCollection();

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
          return entitiesCol as unknown as Collection<Record<string, unknown>>;
        }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EntitiesService,
        { provide: MongodbService, useValue: mongo },
      ],
    }).compile();

    svc = module.get(EntitiesService);
  });

  /* ---------------- getDatatype ---------------- */

  it('getDatatype → maps published doc to DTO', async () => {
    const dtDoc = {
      _id: new ObjectId('000000000000000000000001'),
      key: 'Products',
      keyLower: 'products',
      label: 'Products',
      version: 2,
      status: 'published' as const,
      storage: 'perType' as const,
      fields: [],
      indexes: [],
      createdAt: new Date(0),
      updatedAt: new Date(0),
    };
    datatypesCol.findOne.mockResolvedValueOnce(dtDoc as unknown as Document);

    const dto = await svc.getDatatype('Products');
    expect(dto.key).toBe('Products');
    expect(dto.status).toBe('published');
    expect(dto.storage).toBe('perType');
    expect(dto.id).toBe('000000000000000000000001');
  });

  it('getDatatype → throws UnknownDatatypeError if not found', async () => {
    datatypesCol.findOne.mockResolvedValueOnce(null as unknown as Document);
    await expect(svc.getDatatype('nope')).rejects.toBeInstanceOf(
      UnknownDatatypeError,
    );
  });

  it('getDatatype → throws UnpublishedDatatypeError if draft', async () => {
    const draft = {
      _id: new ObjectId('000000000000000000000002'),
      key: 'Articles',
      keyLower: 'articles',
      label: 'Articles',
      version: 1,
      status: 'draft' as const,
      storage: 'perType' as const,
      fields: [],
    };
    datatypesCol.findOne.mockResolvedValueOnce(draft as unknown as Document);
    await expect(svc.getDatatype('Articles')).rejects.toBeInstanceOf(
      UnpublishedDatatypeError,
    );
  });

  /* ---------------- listEntities ---------------- */

  it('listEntities (perType) → paginates and uses empty filter', async () => {
    const dt = {
      _id: new ObjectId('000000000000000000000003'),
      key: 'Products',
      keyLower: 'products',
      label: 'Products',
      version: 1,
      status: 'published' as const,
      storage: 'perType' as const,
      fields: [],
    };
    datatypesCol.findOne.mockResolvedValueOnce(dt as unknown as Document);
    entitiesCol.countDocuments.mockResolvedValueOnce(0 as unknown as number);
    entitiesCol.find.mockReturnValue(
      makeCursor([]) as unknown as ReturnType<Col['find']>,
    );

    const res = await svc.listEntities('Products', {
      page: 1,
      pageSize: 20,
      sortBy: '_id',
      sortDir: 'asc',
    });
    expect(res.items).toEqual([]);
    expect(res.page).toBe(1);
    expect(res.pageSize).toBe(20);

    const filtArg = entitiesCol.countDocuments.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(filtArg).toEqual({});
  });

  it('listEntities (single) → includes __type discriminator in filter', async () => {
    const dt = {
      _id: new ObjectId('000000000000000000000004'),
      key: 'Orders',
      keyLower: 'orders',
      label: 'Orders',
      version: 1,
      status: 'published' as const,
      storage: 'single' as const,
      fields: [],
    };
    datatypesCol.findOne.mockResolvedValueOnce(dt as unknown as Document);
    entitiesCol.countDocuments.mockResolvedValueOnce(0 as unknown as number);
    entitiesCol.find.mockReturnValue(
      makeCursor([]) as unknown as ReturnType<Col['find']>,
    );

    await svc.listEntities('Orders', {
      page: 1,
      pageSize: 10,
      sortBy: '_id',
      sortDir: 'asc',
    });
    const arg = entitiesCol.countDocuments.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(arg).toHaveProperty('__type', 'orders');
  });

  /* ---------------- getEntity ---------------- */

  it('getEntity → rejects invalid id', async () => {
    const dt = {
      _id: new ObjectId('000000000000000000000005'),
      key: 'Products',
      keyLower: 'products',
      label: 'Products',
      version: 1,
      status: 'published' as const,
      storage: 'perType' as const,
      fields: [],
    };
    datatypesCol.findOne.mockResolvedValueOnce(dt as unknown as Document);

    await expect(svc.getEntity('Products', 'not-an-id')).rejects.toBeInstanceOf(
      EntityNotFoundError,
    );
  });

  it('getEntity (single) → includes __type and maps doc', async () => {
    const dt = {
      _id: new ObjectId('000000000000000000000006'),
      key: 'Orders',
      keyLower: 'orders',
      label: 'Orders',
      version: 1,
      status: 'published' as const,
      storage: 'single' as const,
      fields: [{ key: 'name', label: 'Name', type: 'string' as const }],
    };
    datatypesCol.findOne.mockResolvedValueOnce(dt as unknown as Document);

    const idHex = '0000000000000000000000aa';
    entitiesCol.findOne.mockImplementation(
      async (filter: Record<string, unknown>) => {
        await Promise.resolve();
        if (filter['__type'] !== 'orders') {
          return null as unknown as Document;
        }
        return {
          _id: new ObjectId(idHex),
          __type: 'orders',
          name: 'A',
        } as unknown as Document;
      },
    );

    const res = await svc.getEntity('Orders', idHex);
    expect((res as unknown as Record<string, unknown>)['name']).toBe('A');
    expect(res.id).toBe(idHex);
  });

  /* ---------------- createEntity ---------------- */

  it('createEntity → validates required fields', async () => {
    const dt = {
      _id: new ObjectId('000000000000000000000007'),
      key: 'Products',
      keyLower: 'products',
      label: 'Products',
      version: 1,
      status: 'published' as const,
      storage: 'perType' as const,
      fields: [
        { key: 'name', label: 'Name', type: 'string' as const, required: true },
      ],
    };
    datatypesCol.findOne.mockResolvedValueOnce(dt as unknown as Document);

    await expect(svc.createEntity('Products', {})).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('createEntity → inserts and returns mapped entity', async () => {
    const dt = {
      _id: new ObjectId('000000000000000000000008'),
      key: 'Products',
      keyLower: 'products',
      label: 'Products',
      version: 1,
      status: 'published' as const,
      storage: 'perType' as const,
      fields: [
        { key: 'name', label: 'Name', type: 'string' as const, required: true },
      ],
    };
    datatypesCol.findOne.mockResolvedValueOnce(dt as unknown as Document);

    const newId = new ObjectId('0000000000000000000000bb');
    entitiesCol.insertOne.mockResolvedValueOnce({ insertedId: newId } as never);
    entitiesCol.findOne.mockResolvedValueOnce({
      _id: newId,
      name: 'X',
    } as unknown as Document);

    const res = await svc.createEntity('Products', { name: 'X' });
    expect(res.id).toBe(newId.toHexString());
    expect((res as unknown as Record<string, unknown>)['name']).toBe('X');
  });

  it('createEntity → maps duplicate key error to UniqueViolationError', async () => {
    const dt = {
      _id: new ObjectId('000000000000000000000009'),
      key: 'Products',
      keyLower: 'products',
      label: 'Products',
      version: 1,
      status: 'published' as const,
      storage: 'perType' as const,
      fields: [
        { key: 'sku', label: 'SKU', type: 'string' as const, unique: true },
      ],
    };
    datatypesCol.findOne.mockResolvedValueOnce(dt as unknown as Document);

    // Pre-checks pass (no doc found for current value)
    entitiesCol.findOne.mockResolvedValueOnce(null as unknown as Document);
    // Insert throws server dup key error
    const dupErr = {
      code: 11000,
      message: 'E11000 duplicate key error dup key: { sku: "X" }',
    };
    entitiesCol.insertOne.mockRejectedValueOnce(dupErr);

    await expect(
      svc.createEntity('Products', { sku: 'X' }),
    ).rejects.toBeInstanceOf(UniqueViolationError);
  });

  /* ---------------- updateEntity / deleteEntity minimal paths ---------------- */

  it('updateEntity → not found yields EntityNotFoundError', async () => {
    const dt = {
      _id: new ObjectId('00000000000000000000000a'),
      key: 'Products',
      keyLower: 'products',
      label: 'Products',
      version: 1,
      status: 'published' as const,
      storage: 'perType' as const,
      fields: [{ key: 'name', label: 'Name', type: 'string' as const }],
    };
    datatypesCol.findOne.mockResolvedValueOnce(dt as unknown as Document);

    entitiesCol.findOne.mockResolvedValueOnce(null as unknown as Document); // uniqueness pre-checks
    entitiesCol.updateOne.mockResolvedValueOnce({ matchedCount: 0 } as never);

    await expect(
      svc.updateEntity('Products', '0000000000000000000000cc', { name: 'Y' }),
    ).rejects.toBeInstanceOf(EntityNotFoundError);
  });

  it('deleteEntity → not found yields EntityNotFoundError', async () => {
    const dt = {
      _id: new ObjectId('00000000000000000000000b'),
      key: 'Products',
      keyLower: 'products',
      label: 'Products',
      version: 1,
      status: 'published' as const,
      storage: 'perType' as const,
      fields: [],
    };
    datatypesCol.findOne.mockResolvedValueOnce(dt as unknown as Document);
    entitiesCol.deleteOne.mockResolvedValueOnce({ deletedCount: 0 } as never);

    await expect(
      svc.deleteEntity('Products', '0000000000000000000000dd'),
    ).rejects.toBeInstanceOf(EntityNotFoundError);
  });
});
