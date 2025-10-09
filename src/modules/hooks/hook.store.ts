import { Injectable } from '@nestjs/common';
import type { HookPatch, HookPhase, HookStep } from './types';

@Injectable()
export class HookStore {
  private readonly patchesByType = new Map<string, HookPatch[]>();

  applyPatch(patch: HookPatch): void {
    const list = this.patchesByType.get(patch.typeKey) ?? [];
    list.push(patch);
    this.patchesByType.set(patch.typeKey, list);
  }

  getFlow(typeKey: string, phase: HookPhase): HookStep[] {
    const patches = this.patchesByType.get(typeKey);
    if (!patches || patches.length === 0) return [];
    const steps: HookStep[] = [];
    for (const p of patches) {
      const ph = p.phases[phase];
      if (ph && ph.length > 0) {
        steps.push(...ph);
      }
    }
    return steps;
  }
}
