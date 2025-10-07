// E2E for datatypes (local only, real Mongo). Skips on CI.
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'http';
import supertest from 'supertest';
import { DatatypesModule } from '../../src/modules/datatypes/datatypes.module';
import { MongodbModule } from '../../src/modules/mongodb/mongodb.module';
import { FieldsModule } from '../../src/modules/fields/fields.module';
import type {
  CreateDatatypeResponseDto,
  AddFieldResponseDto,
  UpdateFieldResponseDto,
  RemoveFieldResponseDto,
} from '../../src/modules/datatypes/dto/ListDatatypes.response.dto';

// Gate on CI
const CI = String(process.env.CI ?? '').trim();
const isCI = CI === '1' || CI.toLowerCase() === 'true';

(isCI ? describe.skip : describe)('Datatypes E2E (local, real Mongo)', () => {
  let app: INestApplication;
  let req: supertest.SuperTest<supertest.Test>;

  beforeAll(async () => {
    const modRef = await Test.createTestingModule({
      imports: [MongodbModule, FieldsModule, DatatypesModule],
    }).compile();

    app = modRef.createNestApplication();
    app.setGlobalPrefix('/api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidUnknownValues: false,
      }),
    );
    await app.init();

    const server: Server = app.getHttpServer() as unknown as Server;
    // Explicit cast avoids ESM/CJS overload ambiguity that sometimes yields TestAgent<Test>.
    req = supertest(server) as unknown as supertest.SuperTest<supertest.Test>;
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a draft datatype (perType) and manages unique index flow', async () => {
    // create datatype
    const createRes = await req
      .post('/api/datatypes/create')
      .send({
        key: 'article',
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
        ],
      })
      .expect(201);

    const createBody = createRes.body as Readonly<CreateDatatypeResponseDto>;
    expect(createBody.datatype?.key).toBe('article');
    expect(createBody.datatype?.status).toBe('draft');

    // add another field (non-unique)
    const addRes = await req
      .post('/api/datatypes/add-field')
      .send({
        key: 'article',
        field: {
          fieldKey: 'number',
          required: false,
          array: false,
          unique: false,
        },
      })
      .expect(201);

    const addBody = addRes.body as Readonly<AddFieldResponseDto>;
    expect(addBody.datatype?.fields?.length ?? 0).toBeGreaterThanOrEqual(2);

    // toggle unique on the second field
    const updRes = await req
      .post('/api/datatypes/update-field')
      .send({
        key: 'article',
        fieldKey: 'number',
        patch: { unique: true },
      })
      .expect(201);

    const updBody = updRes.body as Readonly<UpdateFieldResponseDto>;
    expect(
      updBody.datatype?.fields?.some(
        (f) => f.fieldKey === 'number' && f.unique === true,
      ),
    ).toBe(true);

    // remove the first field
    const remRes = await req
      .post('/api/datatypes/remove-field')
      .send({ key: 'article', fieldKey: 'string' })
      .expect(201);

    const remBody = remRes.body as Readonly<RemoveFieldResponseDto>;
    expect(remBody.datatype?.fields?.some((f) => f.fieldKey === 'string')).toBe(
      false,
    );
  });

  it('rejects unique + array combination', async () => {
    const res = await req
      .post('/api/datatypes/create')
      .send({
        key: 'inv',
        label: 'Inventory',
        storage: { mode: 'single' },
        fields: [
          { fieldKey: 'number', required: true, array: true, unique: true },
        ],
      })
      .expect((r) => {
        if (r.status < 400 || r.status >= 500) {
          throw new Error(`Expected 4xx, got ${r.status}`);
        }
      });

    const body = res.body as Readonly<{ message?: unknown }>;
    expect(
      typeof body.message === 'string' || Array.isArray(body.message),
    ).toBe(true);
  });
});
