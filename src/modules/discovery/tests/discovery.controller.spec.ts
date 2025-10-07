import { Test, TestingModule } from '@nestjs/testing';
import { DiscoveryController } from '../discovery.controller';
import { DiscoveryService } from '../discovery.service';
import { BadRequestException } from '@nestjs/common';
import { UnknownDatatypeError } from '../../../lib/errors/EntitiesError';

describe('DiscoveryController', () => {
  let ctrl: DiscoveryController;
  let svc: {
    getManifest: jest.Mock;
    getEntitySchemas: jest.Mock;
  };

  beforeEach(async () => {
    svc = {
      getManifest: jest.fn(async () => {
        await Promise.resolve();
        return {
          version: 1,
          baseUrl: '/api',
          openapiUrl: '/api/openapi.json',
          generatedAt: new Date(0).toISOString(),
          modules: {
            fields: { endpoints: [] },
            datatypes: { endpoints: [] },
            entities: { types: [] },
          },
        };
      }),
      getEntitySchemas: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DiscoveryController],
      providers: [{ provide: DiscoveryService, useValue: svc }],
    }).compile();

    ctrl = module.get(DiscoveryController);
  });

  it('getManifest → returns the manifest', async () => {
    const res = await ctrl.getManifest();
    expect(res.version).toBe(1);
    expect(res.baseUrl).toBe('/api');
  });

  it('getEntitySchema → maps UnknownDatatypeError to BadRequestException', async () => {
    svc.getEntitySchemas.mockRejectedValueOnce(
      new UnknownDatatypeError('nope'),
    );
    await expect(ctrl.getEntitySchema('nope')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
