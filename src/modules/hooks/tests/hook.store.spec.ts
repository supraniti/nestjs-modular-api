import { HookStore } from '../hook.store';
import type { HookPatch } from '../types';

describe('HookStore', () => {
  it('returns [] for missing type/phase', () => {
    const store = new HookStore();
    const flow = store.getFlow('article', 'beforeCreate');
    expect(flow).toEqual([]);
  });

  it('appends steps across patches in apply order', () => {
    const store = new HookStore();
    const patchA: HookPatch = {
      typeKey: 'article',
      phases: {
        beforeCreate: [
          { action: 'a1' as unknown as import('../types').HookActionId },
          { action: 'a2' as unknown as import('../types').HookActionId },
        ],
      },
    };
    const patchB: HookPatch = {
      typeKey: 'article',
      phases: {
        beforeCreate: [
          { action: 'b1' as unknown as import('../types').HookActionId },
        ],
      },
    };

    store.applyPatch(patchA);
    store.applyPatch(patchB);

    const flow = store.getFlow('article', 'beforeCreate');
    expect(flow.map((s) => String(s.action))).toEqual(['a1', 'a2', 'b1']);
  });
});
