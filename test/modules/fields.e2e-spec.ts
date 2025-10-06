import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'http';
import request from 'supertest';

import { FieldsModule } from '../../src/modules/fields/fields.module';

// Skip on CI (CI=true or CI=1)
const IS_CI = /^(1|true)$/i.test(process.env.CI ?? '');

jest.setTimeout(60_000);

/* -----------------------------
   Typed response shapes (DTOs)
   ----------------------------- */
interface StringConstraintsDto {
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly pattern?: string;
}
interface NumberConstraintsDto {
  readonly min?: number;
  readonly max?: number;
  readonly integer?: boolean;
}
interface EnumConstraintsDto {
  readonly values?: ReadonlyArray<string>;
  readonly caseInsensitive?: boolean;
}
type FieldKindDto =
  | { readonly type: 'string'; readonly constraints?: StringConstraintsDto }
  | { readonly type: 'number'; readonly constraints?: NumberConstraintsDto }
  | { readonly type: 'boolean' }
  | { readonly type: 'date' }
  | { readonly type: 'enum'; readonly constraints?: EnumConstraintsDto };

interface FieldDto {
  readonly id: string;
  readonly key: string;
  readonly label: string;
  readonly kind: FieldKindDto;
  readonly locked: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}
interface ListFieldsResponseDto {
  readonly fields: ReadonlyArray<FieldDto>;
}
interface GetFieldResponseDto {
  readonly field: FieldDto | null;
}
interface CreateFieldResponseDto {
  readonly field: FieldDto;
}
interface UpdateFieldResponseDto {
  readonly field: FieldDto;
}
interface DeleteFieldResponseDto {
  readonly deleted: boolean;
}
interface ErrorBody {
  readonly statusCode?: number;
  readonly message?: string | string[];
  readonly error?: string;
}

(IS_CI ? describe.skip : describe)('Fields E2E (local, real Mongo)', () => {
  let app: INestApplication;
  let server: Server;

  const base = '/api/fields';
  const customKey = `e2e-field-${Date.now()}`;
  const seedKey = 'string'; // should be present and locked

  beforeAll(async () => {
    // Ensure local infra can auto-start Mongo if needed
    if (!process.env.MONGO_AUTO_START) {
      process.env.MONGO_AUTO_START = '1';
    }

    const moduleRef = await Test.createTestingModule({
      imports: [FieldsModule],
    }).compile();

    app = moduleRef.createNestApplication();
    // Enable validation similar to a production bootstrap
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    server = app.getHttpServer() as unknown as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists fields and includes locked seeds', async () => {
    const res = await request(server).get(`${base}/list`).expect(200);
    const body = res.body as ListFieldsResponseDto;

    const fields: ReadonlyArray<FieldDto> = body.fields;
    const seedFields: FieldDto[] = fields.filter((f) => f.locked === true);
    const seedKeys = new Set<string>(seedFields.map((f) => f.key));

    // Expect at least our baseline: string, number, boolean, date, enum
    expect(seedKeys.has('string')).toBe(true);
    expect(seedKeys.has('number')).toBe(true);
    expect(seedKeys.has('boolean')).toBe(true);
    expect(seedKeys.has('date')).toBe(true);
    expect(seedKeys.has('enum')).toBe(true);
  });

  it('creates a custom field', async () => {
    const res = await request(server)
      .post(`${base}/create`)
      .send({
        key: customKey,
        label: 'E2E Field',
        kind: { type: 'string', constraints: { minLength: 1, maxLength: 128 } },
      })
      .expect(201);

    const body = res.body as CreateFieldResponseDto;
    expect(body.field.key).toBe(customKey);
    expect(body.field.locked).toBe(false);
    expect(body.field.kind.type).toBe('string');
  });

  it('reads the created field by key', async () => {
    const res = await request(server)
      .get(`${base}/get`)
      .query({ key: customKey })
      .expect(200);

    const body = res.body as GetFieldResponseDto;
    expect(body.field?.key).toBe(customKey);
    expect(body.field?.label).toBe('E2E Field');
  });

  it('updates the custom field label', async () => {
    const res = await request(server)
      .post(`${base}/update`)
      .send({
        key: customKey,
        label: 'E2E Field v2',
      })
      .expect(201);

    const body = res.body as UpdateFieldResponseDto;
    expect(body.field.key).toBe(customKey);
    expect(body.field.label).toBe('E2E Field v2');
  });

  it('rejects deleting a locked seed field (expects 4xx)', async () => {
    const res = await request(server)
      .post(`${base}/delete`)
      .send({ key: seedKey });

    // We don't enforce the exact code (400 vs 409 vs 422) here;
    // we only assert it is a client error.
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);

    const err = res.body as ErrorBody;
    const msg = Array.isArray(err.message)
      ? err.message.join(' ')
      : (err.message ?? '');
    const lowered = msg.toString().toLowerCase();
    expect(lowered.includes('locked')).toBe(true);
  });

  it('deletes the custom field', async () => {
    const res = await request(server)
      .post(`${base}/delete`)
      .send({ key: customKey })
      .expect(201);

    const body = res.body as DeleteFieldResponseDto;
    expect(body.deleted).toBe(true);
  });

  it('returns null for the deleted field', async () => {
    const res = await request(server)
      .get(`${base}/get`)
      .query({ key: customKey })
      .expect(200);

    const body = res.body as GetFieldResponseDto;
    expect(body.field).toBeNull();
  });
});
