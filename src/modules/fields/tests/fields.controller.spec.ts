import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ObjectId } from 'mongodb';

import { FieldsController } from '../fields.controller';
import { FieldsService } from '../fields.service';
import type { FieldKind, FieldDoc } from '../internal';
import { MongoActionError } from '../../../lib/errors/MongoActionError';

describe('FieldsController (unit)', () => {
  let controller: FieldsController;
  let service: jest.Mocked<FieldsService>;

  const mkDoc = (over: Partial<FieldDoc> = {}): FieldDoc => {
    const now = new Date();
    const base: FieldDoc = {
      _id: new ObjectId(),
      key: 'string',
      keyLower: 'string',
      label: 'String',
      kind: { type: 'string' } as FieldKind,
      locked: true,
      createdAt: now,
      updatedAt: now,
    };
    return { ...base, ...over };
  };

  beforeEach(async () => {
    const mockService: jest.Mocked<FieldsService> = {
      list: jest.fn(),
      getByKey: jest.fn(),
      create: jest.fn(),
      updateByKey: jest.fn(),
      deleteByKey: jest.fn(),
      getCollection: undefined,
    } as unknown as jest.Mocked<FieldsService>;

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [FieldsController],
      providers: [{ provide: FieldsService, useValue: mockService }],
    }).compile();

    controller = moduleRef.get(FieldsController);
    service = moduleRef.get(FieldsService);
  });

  it('lists fields', async () => {
    service.list.mockResolvedValue([mkDoc({ key: 'string', label: 'String' })]);

    const res = await controller.list();
    expect(res.fields).toHaveLength(1);
    expect(res.fields[0]?.key).toBe('string');
    expect(res.fields[0]?.label).toBe('String');
  });

  it('gets field by key', async () => {
    service.getByKey.mockResolvedValue(mkDoc({ key: 'string' }));

    const res = await controller.get({ key: 'string' });
    expect(res.field?.key).toBe('string');
  });

  it('create maps AppError to BadRequest', async () => {
    service.create.mockRejectedValue(
      new MongoActionError('boom', { operation: 't' }),
    );

    await expect(
      controller.create({
        key: 'custom',
        label: 'Custom',
        kind: { type: 'string' } as Record<string, unknown>,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('update requires at least one field (label or kind)', async () => {
    await expect(controller.update({ key: 'k' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('delete maps AppError to BadRequest', async () => {
    service.deleteByKey.mockRejectedValue(
      new MongoActionError('nope', { operation: 't' }),
    );

    await expect(controller.delete({ key: 'string' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
