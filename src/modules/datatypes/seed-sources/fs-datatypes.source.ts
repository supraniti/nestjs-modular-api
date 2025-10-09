import { promises as fs } from 'node:fs';
import * as path from 'node:path';

import {
  type DatatypeSeed,
  parseDatatypeSeedLiteral,
} from '../internal/datatypes.seeds';

export async function loadDatatypeSeedsFromDir(
  dir: string,
): Promise<ReadonlyArray<DatatypeSeed>> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith('.') && isJsonFile(name))
    .sort((a, b) => a.localeCompare(b));

  const seeds: DatatypeSeed[] = [];
  const seen = new Map<string, string>();

  for (const fileName of files) {
    const filePath = path.join(dir, fileName);
    const contents = await fs.readFile(filePath, 'utf8');

    let literal: unknown;
    try {
      literal = JSON.parse(contents);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`${fileName}: Failed to parse JSON: ${message}`);
    }

    const seed = parseDatatypeSeedLiteral(literal, fileName);
    const existing = seen.get(seed.keyLower);
    if (existing) {
      throw new Error(
        `Duplicate datatype seed key "${seed.keyLower}" found in files ${existing} and ${fileName}.`,
      );
    }
    seen.set(seed.keyLower, fileName);
    seeds.push(seed);
  }

  return Object.freeze(seeds);
}

export function mergeDatatypeSeeds(
  jsonSeeds: ReadonlyArray<DatatypeSeed>,
  fsSeeds: ReadonlyArray<DatatypeSeed>,
): ReadonlyArray<DatatypeSeed> {
  if (fsSeeds.length === 0) {
    return Object.freeze([...jsonSeeds]);
  }

  const byLower = new Map<string, DatatypeSeed>();
  for (const seed of jsonSeeds) {
    byLower.set(seed.keyLower, seed);
  }
  for (const seed of fsSeeds) {
    byLower.set(seed.keyLower, seed);
  }

  return Object.freeze(Array.from(byLower.values()));
}

function isJsonFile(name: string): boolean {
  return path.extname(name).toLowerCase() === '.json';
}
