import { Injectable, Logger } from '@nestjs/common';
import { MongodbService } from '../mongodb/mongodb.service';
import type { ObjectId, Document, Filter } from 'mongodb';

// Local imports for seed shapes
import type { DatatypeSeed } from './internal/datatypes.seeds';

export type OnDeleteMode = 'restrict' | 'setNull' | 'cascade';

export type RefEdge = {
  from: string; // referencing datatype keyLower
  to: string; // referenced datatype keyLower
  fieldKey: string;
  many: boolean;
  onDelete: OnDeleteMode;
};

class RefGraph {
  private readonly incoming: Map<string, RefEdge[]> = new Map(); // target -> edges
  private readonly outgoing: Map<string, RefEdge[]> = new Map(); // from -> edges

  public setEdges(edges: RefEdge[]): void {
    this.incoming.clear();
    this.outgoing.clear();
    for (const e of edges) {
      const inList = this.incoming.get(e.to) ?? [];
      inList.push(e);
      this.incoming.set(e.to, inList);
      const outList = this.outgoing.get(e.from) ?? [];
      outList.push(e);
      this.outgoing.set(e.from, outList);
    }
  }

  public getIncoming(target: string): RefEdge[] {
    return [...(this.incoming.get(target) ?? [])];
  }
  public getOutgoing(from: string): RefEdge[] {
    return [...(this.outgoing.get(from) ?? [])];
  }
  public toEdges(): RefEdge[] {
    const all: RefEdge[] = [];
    for (const list of this.outgoing.values()) all.push(...list);
    return all;
  }
}

@Injectable()
export class RefIntegrityService {
  private readonly logger = new Logger('RefIntegrity');
  private graph = new RefGraph();
  private initialized = false;

  constructor(private readonly mongo: MongodbService) {}

  // Build graph from normalized seeds
  public buildFromSeeds(seeds: ReadonlyArray<DatatypeSeed>): void {
    const edges: RefEdge[] = [];
    for (const seed of seeds) {
      const from = seed.keyLower;
      for (const f of seed.fields) {
        const k = (
          f as unknown as {
            kind?: {
              type?: string;
              target?: string;
              cardinality?: 'one' | 'many';
              onDelete?: OnDeleteMode;
            };
          }
        ).kind;
        if (!k || k.type !== 'ref') continue;
        const to = String(k.target).toLowerCase();
        const many = k.cardinality ? k.cardinality === 'many' : !!f.array;
        const onDelete: OnDeleteMode = k.onDelete ?? 'restrict';
        edges.push({ from, to, fieldKey: f.fieldKey, many, onDelete });
      }
    }
    this.graph.setEdges(edges);
    this.initialized = true;
    this.logger.log(`Ref graph built with ${edges.length} edge(s).`);
  }

  public getIncoming(targetKeyLower: string): RefEdge[] {
    return this.graph.getIncoming(targetKeyLower);
  }
  public getOutgoing(typeKeyLower: string): RefEdge[] {
    return this.graph.getOutgoing(typeKeyLower);
  }
  public toEdges(): RefEdge[] {
    return this.graph.toEdges();
  }

  // Fast existence check: returns set of missing id hex strings
  public async existsMany(
    targetKeyLower: string,
    ids: ObjectId[],
  ): Promise<Set<string>> {
    const missing = new Set(ids.map((i) => i.toHexString()));
    if (ids.length === 0) return missing; // trivial

    // Load target datatype to resolve collection/discriminator
    const db = await this.mongo.getDb();
    const dts = db.collection<Record<string, unknown>>('datatypes');
    const dt = await dts.findOne({
      keyLower: targetKeyLower,
    } as Filter<Document>);
    if (!dt) return missing; // unknown type => treat all missing

    const info = this.resolveCollectionInfo(dt);
    const col = db.collection<Record<string, unknown>>(info.collection);
    const filter: Filter<Document> = info.discriminator
      ? {
          _id: { $in: ids },
          [info.discriminator.field]: info.discriminator.value,
        }
      : { _id: { $in: ids } };
    const found = await col.find(filter, { projection: { _id: 1 } }).toArray();
    for (const f of found) {
      const idHex = (f._id as unknown as ObjectId).toHexString();
      missing.delete(idHex);
    }
    return missing;
  }

  // Lazy loader: when seeds bootstrap did not run (e2e/local), build from stored datatypes
  public async ensureFromDb(): Promise<void> {
    const db = await this.mongo.getDb();
    const col = db.collection<Record<string, unknown>>('datatypes');
    const docs = await col.find({}).toArray();
    const edges: RefEdge[] = [];
    for (const d of docs) {
      const from = String(
        (d['keyLower'] as string) ?? (d['key'] as string) ?? '',
      ).toLowerCase();
      if (!from) continue;
      const fields = (d['fields'] as unknown[]) ?? [];
      for (const f of fields) {
        const obj = f as Record<string, unknown>;
        const kind = obj['kind'] as
          | {
              type?: string;
              target?: string;
              cardinality?: 'one' | 'many';
              onDelete?: OnDeleteMode;
            }
          | undefined;
        if (!kind || kind.type !== 'ref') continue;
        const rawKey = obj['key'] ?? obj['fieldKey'];
        if (typeof rawKey !== 'string' || rawKey.trim().length === 0) continue;
        const fieldKey = rawKey.trim();
        const to = String(kind.target ?? '').toLowerCase();
        if (!to) continue;
        const many = kind.cardinality
          ? kind.cardinality === 'many'
          : obj['array'] === true;
        const onDelete: OnDeleteMode =
          (kind.onDelete as OnDeleteMode) ?? 'restrict';
        edges.push({ from, to, fieldKey, many, onDelete });
      }
    }
    this.graph.setEdges(edges);
    this.initialized = true;
    this.logger.log(`Ref graph built from DB with ${edges.length} edge(s).`);
  }

  // Minimal helper copied from EnrichAction/EntitiesService logic
  private resolveCollectionInfo(dt: Record<string, unknown>): {
    collection: string;
    discriminator?: { field: string; value: string };
  } {
    const keyLower =
      `${(dt['keyLower'] as string) ?? (dt['key'] as string) ?? ''}`.toLowerCase();
    const storageMode = dt['storage'];
    const mode =
      typeof storageMode === 'string'
        ? storageMode
        : (storageMode as { mode?: string })?.mode;
    if (mode === 'perType') return { collection: `data_${keyLower}` };
    if (mode === 'single')
      return {
        collection: 'data_entities',
        discriminator: { field: '__type', value: keyLower },
      };
    return { collection: `data_${keyLower}` };
  }
}
