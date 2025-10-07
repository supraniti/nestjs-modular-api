import { Test } from '@nestjs/testing';
import { DatatypesController } from '../datatypes.controller';
import { DatatypesService } from '../datatypes.service';
import type { DataTypeDoc } from '../internal';
import { ObjectId } from 'mongodb';
import { AppError } from '../../../lib/errors/AppError';
import { BadRequestException } from '@nestjs/common';

// Narrow mock surface to only methods the controller calls.
type SvcMock = Pick<
  DatatypesService,
  'list' | 'getByKey' | 'create' | 'addField' | 'updateField' | 'removeField'
>;

describe('DatatypesController', () => {
  let controller: DatatypesController;
  let svc: jest.Mocked<SvcMock>;

  beforeEach(async () => {
    const svcMock: SvcMock = {
      list: jest.fn(),
      getByKey: jest.fn(),
      create: jest.fn(),
      addField: jest.fn(),
      updateField: jest.fn(),
      removeField: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [DatatypesController],
      providers: [
        {
          provide: DatatypesService,
          // Provide as the concrete token, but only with our narrowed surface.
          useValue: svcMock,
        },
      ],
    }).compile();

    controller = moduleRef.get(DatatypesController);
    // Retrieve and cast to jest.Mocked<SvcMock> for typed .mock usage
    svc = moduleRef.get(DatatypesService);
  });

  function mkDoc(): DataTypeDoc {
    const now = new Date();
    return {
      _id: new ObjectId(),
      key: 'article',
      keyLower: 'article',
      label: 'Article',
      version: 1,
      status: 'draft',
      fields: [],
      storage: { mode: 'single' },
      locked: false,
      createdAt: now,
      updatedAt: now,
    };
  }

  it('list maps docs to DTOs', async () => {
    svc.list.mockResolvedValue([mkDoc()]);
    const res = await controller.list();
    expect(res.datatypes).toHaveLength(1);
    expect(res.datatypes[0]?.key).toBe('article');
  });

  it('create maps AppError to HTTP 400', async () => {
    svc.create.mockRejectedValue(new AppError('nope'));
    await expect(
      controller.create({ key: 'article', label: 'Article' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
