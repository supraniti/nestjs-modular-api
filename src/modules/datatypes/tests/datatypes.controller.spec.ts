// If your controller is a *named* export, change the next line to:
import { DatatypesController } from '../datatypes.controller';

import type { ObjectId } from 'mongodb';
import type { DataTypeDoc, EntityField } from '../internal';

import type {
  AddFieldResponseDto,
  CreateDatatypeResponseDto,
  GetDatatypeResponseDto,
  ListDatatypesResponseDto,
  RemoveFieldResponseDto,
  UpdateFieldResponseDto,
  PublishDatatypeResponseDto,
  UnpublishDatatypeResponseDto,
} from '../dto/ListDatatypes.response.dto';
import type { CreateDatatypeRequestDto } from '../dto/CreateDatatype.request.dto';
import type { AddFieldRequestDto } from '../dto/AddField.request.dto';
import type { UpdateFieldRequestDto } from '../dto/UpdateField.request.dto';
import type { RemoveFieldRequestDto } from '../dto/RemoveField.request.dto';
import type { PublishDatatypeRequestDto } from '../dto/PublishDatatype.request.dto';
import type { UnpublishDatatypeRequestDto } from '../dto/UnpublishDatatype.request.dto';

/** Minimal service port the controller relies on (kept independent of the real service type). */
interface SvcPort {
  list(dbName?: string): Promise<ReadonlyArray<DataTypeDoc>>;
  getByKey(key: string, dbName?: string): Promise<DataTypeDoc | null>;
  create(
    input: {
      readonly key: string;
      readonly label: string;
      readonly fields?: ReadonlyArray<{
        readonly fieldKey: string;
        readonly required?: boolean;
        readonly array?: boolean;
        readonly unique?: boolean;
        readonly order?: number;
        readonly constraints?: Record<string, unknown> | undefined;
      }>;
      readonly storage?: { readonly mode: 'single' | 'perType' };
      readonly indexes?: ReadonlyArray<{
        readonly keys: Readonly<Record<string, 1 | -1 | 'text'>>;
        readonly options?: Readonly<Record<string, unknown>>;
      }>;
    },
    dbName?: string,
  ): Promise<DataTypeDoc>;
  addField(
    key: string,
    field: {
      readonly fieldKey: string;
      readonly required?: boolean;
      readonly array?: boolean;
      readonly unique?: boolean;
      readonly order?: number;
      readonly constraints?: Record<string, unknown> | undefined;
    },
    dbName?: string,
  ): Promise<DataTypeDoc>;
  updateField(
    key: string,
    fieldKey: string,
    patch: Partial<{
      readonly required: boolean;
      readonly array: boolean;
      readonly unique: boolean;
      readonly order: number;
      readonly constraints: Record<string, unknown> | undefined;
    }>,
    dbName?: string,
  ): Promise<DataTypeDoc>;
  removeField(
    key: string,
    fieldKey: string,
    dbName?: string,
  ): Promise<DataTypeDoc>;
  publish(key: string, dbName?: string): Promise<DataTypeDoc>;
  unpublish(key: string, dbName?: string): Promise<DataTypeDoc>;
}

/** Minimal ObjectId stub for mapping tests (prevents real driver construction). */
interface FakeObjectId {
  toHexString(): string;
}
const fakeId = (hex: string): FakeObjectId => ({
  toHexString: () => hex,
});

/** Strictly-typed fake service that you can configure per test. */
class FakeDatatypesService implements SvcPort {
  public listImpl: () => Promise<ReadonlyArray<DataTypeDoc>> = () =>
    Promise.resolve([]);
  public getByKeyImpl: (key: string) => Promise<DataTypeDoc | null> = () =>
    Promise.resolve(null);
  public createImpl: (
    _input: unknown,
    _dbName?: string,
  ) => Promise<DataTypeDoc> = () => Promise.reject(new Error('not set'));
  public addFieldImpl: (
    _key: string,
    _field: unknown,
    _dbName?: string,
  ) => Promise<DataTypeDoc> = () => Promise.reject(new Error('not set'));
  public updateFieldImpl: (
    _key: string,
    _fieldKey: string,
    _patch: unknown,
    _dbName?: string,
  ) => Promise<DataTypeDoc> = () => Promise.reject(new Error('not set'));
  public removeFieldImpl: (
    _key: string,
    _fieldKey: string,
    _dbName?: string,
  ) => Promise<DataTypeDoc> = () => Promise.reject(new Error('not set'));
  public publishImpl: (_key: string, _dbName?: string) => Promise<DataTypeDoc> =
    () => Promise.reject(new Error('not set'));
  public unpublishImpl: (
    _key: string,
    _dbName?: string,
  ) => Promise<DataTypeDoc> = () => Promise.reject(new Error('not set'));

  // Methods return Promises without being 'async' (so we don't trigger require-await)
  public list(): Promise<ReadonlyArray<DataTypeDoc>> {
    return this.listImpl();
  }
  public getByKey(key: string): Promise<DataTypeDoc | null> {
    return this.getByKeyImpl(key);
  }
  public create(input: unknown, dbName?: string): Promise<DataTypeDoc> {
    return this.createImpl(input, dbName);
  }
  public addField(
    key: string,
    field: unknown,
    dbName?: string,
  ): Promise<DataTypeDoc> {
    return this.addFieldImpl(key, field, dbName);
  }
  public updateField(
    key: string,
    fieldKey: string,
    patch: unknown,
    dbName?: string,
  ): Promise<DataTypeDoc> {
    return this.updateFieldImpl(key, fieldKey, patch, dbName);
  }
  public removeField(
    key: string,
    fieldKey: string,
    dbName?: string,
  ): Promise<DataTypeDoc> {
    return this.removeFieldImpl(key, fieldKey, dbName);
  }
  public publish(key: string, dbName?: string): Promise<DataTypeDoc> {
    return this.publishImpl(key, dbName);
  }
  public unpublish(key: string, dbName?: string): Promise<DataTypeDoc> {
    return this.unpublishImpl(key, dbName);
  }
}

describe('DatatypesController (unit, typed fake service)', () => {
  let controller: InstanceType<typeof DatatypesController>;
  let svc: FakeDatatypesService;

  const now = new Date();
  const baseFields: ReadonlyArray<EntityField> = [
    {
      fieldKey: 'string',
      required: true,
      array: false,
      unique: true,
      order: 0,
      constraints: undefined,
    },
  ];

  const makeDoc = (overrides?: Partial<DataTypeDoc>): DataTypeDoc => ({
    _id: fakeId('507f1f77bcf86cd799439011') as unknown as ObjectId,
    key: 'article',
    keyLower: 'article',
    label: 'Article',
    version: 1,
    status: 'draft',
    fields: [...baseFields],
    storage: { mode: 'perType' },
    indexes: [],
    locked: false,
    createdAt: now,
    updatedAt: now,
    ...(overrides ?? {}),
  });

  beforeEach(() => {
    svc = new FakeDatatypesService();

    // Instantiate the controller without importing its constructor param type.
    // We type the constructor structurally to accept a single unknown arg.
    type Ctor = new (
      svcArg: unknown,
    ) => InstanceType<typeof DatatypesController>;
    const C = DatatypesController as unknown as Ctor;
    controller = new C(svc);
  });

  it('list → maps DataTypeDoc[] to ListDatatypesResponseDto', async () => {
    const doc = makeDoc();
    svc.listImpl = () => Promise.resolve([doc]);

    const res: ListDatatypesResponseDto = await controller.list();

    expect(res.datatypes.length).toBe(1);
    const d0 = res.datatypes[0];
    expect(d0.key).toBe('article');
    expect(d0.id).toBe('507f1f77bcf86cd799439011');
    expect(d0.storage.mode).toBe('perType');
    expect(new Date(d0.createdAt).toISOString()).toBe(
      doc.createdAt.toISOString(),
    );
  });

  it('get → returns one (mapped) or null', async () => {
    const doc = makeDoc();
    svc.getByKeyImpl = (key) => Promise.resolve(key === 'article' ? doc : null);

    const ok: GetDatatypeResponseDto = await controller.get({ key: 'article' });
    expect(ok.datatype?.key).toBe('article');

    const miss: GetDatatypeResponseDto = await controller.get({
      key: 'missing',
    });
    expect(miss.datatype).toBeNull();
  });

  it('create → returns mapped dto', async () => {
    const created = makeDoc();
    svc.createImpl = () => Promise.resolve(created);

    const req: CreateDatatypeRequestDto = {
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
    };

    const res: CreateDatatypeResponseDto = await controller.create(req);
    expect(res.datatype.key).toBe('article');
    expect(res.datatype.status).toBe('draft');
  });

  it('add-field → returns updated doc mapped', async () => {
    const updated = makeDoc({
      fields: [
        ...baseFields,
        { fieldKey: 'number', required: false, array: false, unique: false },
      ],
    });
    svc.addFieldImpl = () => Promise.resolve(updated);

    const req: AddFieldRequestDto = {
      key: 'article',
      field: {
        fieldKey: 'number',
        required: false,
        array: false,
        unique: false,
      },
    };

    const res: AddFieldResponseDto = await controller.addField(req);
    expect(res.datatype.fields.some((f) => f.fieldKey === 'number')).toBe(true);
  });

  it('update-field → returns updated doc mapped', async () => {
    const updated = makeDoc({
      fields: [
        {
          fieldKey: 'string',
          required: true,
          array: false,
          unique: false,
          order: 0,
        },
      ],
    });
    svc.updateFieldImpl = () => Promise.resolve(updated);

    const req: UpdateFieldRequestDto = {
      key: 'article',
      fieldKey: 'string',
      patch: { unique: false },
    };

    const res: UpdateFieldResponseDto = await controller.updateField(req);
    expect(
      res.datatype.fields.find((f) => f.fieldKey === 'string')?.unique,
    ).toBe(false);
  });

  it('remove-field → returns updated doc mapped', async () => {
    const updated = makeDoc({ fields: [] });
    svc.removeFieldImpl = () => Promise.resolve(updated);

    const req: RemoveFieldRequestDto = { key: 'article', fieldKey: 'string' };
    const res: RemoveFieldResponseDto = await controller.removeField(req);

    expect(res.datatype.fields.length).toBe(0);
  });

  it('publish → returns mapped doc with status=published', async () => {
    const published = makeDoc({ status: 'published' });
    svc.publishImpl = () => Promise.resolve(published);

    const req: PublishDatatypeRequestDto = { key: 'article' };
    const res: PublishDatatypeResponseDto = await controller.publish(req);

    expect(res.datatype.status).toBe('published');
  });

  it('unpublish → returns mapped doc with status=draft', async () => {
    const draft = makeDoc({ status: 'draft' });
    svc.unpublishImpl = () => Promise.resolve(draft);

    const req: UnpublishDatatypeRequestDto = { key: 'article' };
    const res: UnpublishDatatypeResponseDto = await controller.unpublish(req);

    expect(res.datatype.status).toBe('draft');
  });
});
