import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { EntitiesController } from '../entities.controller';
import { EntitiesService } from '../entities.service';
import { UnknownDatatypeError } from '../../../lib/errors/EntitiesError';

describe('EntitiesController', () => {
  let controller: EntitiesController;
  let service: jest.Mocked<EntitiesService>;

  beforeEach(async () => {
    const mockService: Partial<jest.Mocked<EntitiesService>> = {
      getDatatype: jest.fn(),
      listEntities: jest.fn(),
      getEntity: jest.fn(),
      createEntity: jest.fn(),
      updateEntity: jest.fn(),
      deleteEntity: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EntitiesController],
      providers: [{ provide: EntitiesService, useValue: mockService }],
    }).compile();

    controller = module.get(EntitiesController);
    service = module.get(EntitiesService);
  });

  it('returns datatype dto (happy path)', async () => {
    service.getDatatype.mockResolvedValue({
      id: '000000000000000000000000',
      key: 'products',
      label: 'Products',
      version: 1,
      status: 'published',
      storage: 'perType',
      fields: [],
      indexes: [],
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    });

    const res = await controller.getDatatype('products');
    expect(res.key).toBe('products');
    expect(res.status).toBe('published');
  });

  it('maps UnknownDatatypeError to BadRequestException', async () => {
    service.getDatatype.mockRejectedValue(new UnknownDatatypeError('nope'));
    await expect(controller.getDatatype('nope')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
