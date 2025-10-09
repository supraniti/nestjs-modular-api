import { Test } from '@nestjs/testing';
import { HookRegistry } from '../hook.registry';
import { ValidateAction } from '../actions/validate.action';
import { EnrichAction } from '../actions/enrich.action';

describe('HookRegistry', () => {
  it('pre-registers built-ins and get returns them', async () => {
    const module = await Test.createTestingModule({
      providers: [HookRegistry, ValidateAction, EnrichAction],
    }).compile();

    const registry = module.get(HookRegistry);
    const validate = registry.get(
      'validate' as unknown as import('../types').HookActionId,
    );
    const enrich = registry.get(
      'enrich' as unknown as import('../types').HookActionId,
    );
    expect(validate?.id).toBe('validate');
    expect(enrich?.id).toBe('enrich');
  });

  it('prevents duplicate registration', async () => {
    const module = await Test.createTestingModule({
      providers: [HookRegistry, ValidateAction, EnrichAction],
    }).compile();

    const registry = module.get(HookRegistry);
    expect(() =>
      registry.register({
        id: 'validate' as unknown as import('../types').HookActionId,
        run: (ctx) => ctx,
      }),
    ).toThrow(/Duplicate action id: validate/);
  });
});
