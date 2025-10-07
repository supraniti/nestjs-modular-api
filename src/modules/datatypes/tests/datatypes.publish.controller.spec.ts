import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { DatatypesController } from '../datatypes.controller';
import { DatatypesService } from '../datatypes.service';
import type { DataTypeDoc } from '../internal';
import { AppError } from '../../../lib/errors/AppError';
import { ObjectId } from 'mongodb';

function sampleDoc(overrides: Partial<DataTypeDoc> = {}): DataTypeDoc {
  const now = new Date();
  return {
    _id: new ObjectId(),
    key: 'article',
    keyLower: 'article',
    label: 'Article',
    version: 1,
    status: 'draft',
    storage: { mode: 'perType' },
    fields: [
      {
        fieldKey: 'string',
        required: true,
        array: false,
        unique: true,
        order: 0,
        constraints: undefined,
      },
    ],
    indexes: [],
    locked: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('DatatypesController – publish/unpublish', () => {
  let ctrl: DatatypesController;

  // Strongly-typed mocks to avoid unsafe-any complaints
  const publishMock = jest.fn<Promise<DataTypeDoc>, [string]>();
  const unpublishMock = jest.fn<Promise<DataTypeDoc>, [string]>();

  beforeAll(async () => {
    const serviceStub: Pick<DatatypesService, 'publish' | 'unpublish'> = {
      publish: (key: string) => publishMock(key),
      unpublish: (key: string) => unpublishMock(key),
    };

    const modRef = await Test.createTestingModule({
      controllers: [DatatypesController],
      providers: [{ provide: DatatypesService, useValue: serviceStub }],
    }).compile();

    ctrl = modRef.get(DatatypesController);
  });

  afterEach(() => {
    publishMock.mockReset();
    unpublishMock.mockReset();
  });

  it('publish → returns mapped DTO', async () => {
    const doc = sampleDoc({ status: 'published' });
    publishMock.mockResolvedValueOnce(doc);

    const res = await ctrl.publish({ key: 'article' });
    expect(res.datatype?.key).toBe('article');
    expect(res.datatype?.status).toBe('published');
    expect(res.datatype?.id).toBe(doc._id.toHexString());
  });

  it('publish → AppError becomes BadRequest (400)', async () => {
    publishMock.mockRejectedValueOnce(new AppError('boom'));
    await expect(ctrl.publish({ key: 'article' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('unpublish → returns mapped DTO', async () => {
    const doc = sampleDoc({ status: 'draft' });
    unpublishMock.mockResolvedValueOnce(doc);

    const res = await ctrl.unpublish({ key: 'article' });
    expect(res.datatype?.status).toBe('draft');
  });
});
