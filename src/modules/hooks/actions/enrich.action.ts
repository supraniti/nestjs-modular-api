import { Injectable, Logger } from '@nestjs/common';
import type { HookAction, HookActionId, HookContext } from '../types';
import Ajv from 'ajv';
import { MongodbService } from '../../mongodb/mongodb.service';
import { ObjectId, type Document, type Filter } from 'mongodb';
import { ValidationHttpException } from '../../../lib/errors/ValidationHttpException';

@Injectable()
export class EnrichAction implements HookAction<unknown, unknown> {
  id: HookActionId = 'enrich' as unknown as HookActionId;
  private readonly logger = new Logger('EnrichAction');

  private readonly ajv = new Ajv({
    strict: true,
    allErrors: true,
    useDefaults: true,
  });
  private readonly argsSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      with: {
        type: 'array',
        items: { type: 'string', minLength: 1 },
        minItems: 1,
      },
      maxDepth: { type: 'integer', minimum: 0, maximum: 5, default: 0 },
      select: {
        type: 'object',
        additionalProperties: { type: 'array', items: { type: 'string' } },
      },
      paths: {
        type: 'object',
        propertyNames: { pattern: '^[1-5]$' },
        additionalProperties: {
          type: 'array',
          items: { type: 'string', minLength: 1 },
          minItems: 1,
        },
      },
    },
    required: ['with'],
  } as const;
  private readonly validateArgs = this.ajv.compile(this.argsSchema);

  // per-run cache: typeKey -> idHex -> resolved doc
  private cache?: Map<string, Map<string, Record<string, unknown>>>;

  constructor(private readonly mongo: MongodbService) {}

  async run(
    ctx: HookContext<unknown, unknown>,
  ): Promise<HookContext<unknown, unknown>> {
    const typeKey = String(ctx.meta.typeKey ?? '');
    const rawPhase = (ctx.meta as Record<string, unknown>)['phase'];
    const phase = typeof rawPhase === 'string' ? rawPhase : '';
    const stepArgs = ctx.meta.stepArgs ?? {};
    const ok = this.validateArgs(stepArgs);
    if (!ok) {
      const details = (this.validateArgs.errors ?? []).map((e) => ({
        path: e.instancePath || '/',
        keyword: e.keyword,
        message: e.message ?? 'invalid args',
      }));
      throw new ValidationHttpException(details);
    }
    const withKeys = (stepArgs['with'] as string[]) ?? [];
    const select = (stepArgs['select'] as Record<string, string[]>) ?? {};
    let maxDepth = Math.max(0, Number(stepArgs['maxDepth'] ?? 0));
    if (maxDepth > 5) {
      this.logger.debug?.(`maxDepth ${maxDepth} > 5; clamping to 5`);
      maxDepth = 5;
    }
    const paths =
      (stepArgs['paths'] as Record<string, string[]> | undefined) ?? undefined;

    // Only operate on afterGet/afterList with result present
    if (phase !== 'afterGet' && phase !== 'afterList') return ctx;
    if (ctx.result == null) return ctx;

    // Load current datatype to inspect ref constraints
    await this.loadDatatype(typeKey); // ensure datatype exists; specific fields loaded per-node below

    const items: Record<string, unknown>[] = Array.isArray(ctx.result)
      ? (ctx.result as Record<string, unknown>[])
      : [ctx.result as Record<string, unknown>];

    // Resolve recursively up to maxDepth
    const NODE_LIMIT = Math.max(
      1,
      Number.parseInt(process.env.HOOKS_ENRICH_NODE_LIMIT ?? '10000', 10) ||
        10000,
    );
    const FANOUT_LIMIT = Math.max(
      1,
      Number.parseInt(process.env.HOOKS_ENRICH_FANOUT_LIMIT ?? '1000', 10) ||
        1000,
    );
    let nodeCount = 0;
    let warnedFanout = false;
    let warnedNodeLimit = false;
    const setTruncated = (doc: Record<string, unknown>) => {
      doc['__enrichTruncated'] = true;
    };

    // caches
    this.cache = new Map<string, Map<string, Record<string, unknown>>>();
    const dtCache = new Map<string, Record<string, unknown>>();
    const getDt = async (k: string) => {
      const cached = dtCache.get(k);
      if (cached) return cached;
      const d = await this.loadDatatype(k);
      dtCache.set(k, d);
      return d;
    };
    const visited = new Map<string, Set<string>>();
    const markVisited = (t: string, id: string) => {
      const set = visited.get(t) ?? new Set<string>();
      set.add(id);
      visited.set(t, set);
    };
    const isVisited = (t: string, id: string) =>
      visited.get(t)?.has(id) === true;

    // nodes per depth: array of { typeKey, doc }
    type Node = { typeKey: string; doc: Record<string, unknown> };
    let current: Node[] = items.map((d) => ({ typeKey, doc: d }));

    // Depth 0 attachments
    for (let depth = 0; depth <= maxDepth; depth++) {
      const fieldsAtDepth =
        depth === 0 ? withKeys : (paths?.[String(depth)] ?? withKeys);
      if (!fieldsAtDepth || fieldsAtDepth.length === 0) {
        current = [];
        break;
      }
      // plan ids to fetch
      const plan = new Map<string, Set<string>>(); // targetType -> ids
      // prefetch dt for current node types
      for (const node of current) await getDt(node.typeKey);

      for (const node of current) {
        const dtNode = await getDt(node.typeKey);
        for (const fieldKey of fieldsAtDepth) {
          const field = this.findField(dtNode, fieldKey);
          if (!field) continue;
          const constraints =
            (field['constraints'] as Record<string, unknown> | undefined) ??
            undefined;
          const targetType =
            (constraints?.['ref'] as string | undefined) || undefined;
          if (!targetType) continue;
          const outKey = `${fieldKey}Resolved`;
          const val = node.doc[fieldKey];
          if (val == null) {
            node.doc[outKey] = Array.isArray(val) ? [] : null;
            continue;
          }
          const bucket = plan.get(targetType) ?? new Set<string>();
          plan.set(targetType, bucket);
          if (Array.isArray(val)) {
            const ids: string[] = [];
            for (const v of val) {
              const hex = this.asHexId(v);
              if (hex) ids.push(hex);
            }
            if (ids.length > FANOUT_LIMIT) {
              if (!warnedFanout) {
                this.logger.warn(
                  `enrich fanout exceeded ${FANOUT_LIMIT}; truncating`,
                );
                warnedFanout = true;
              }
              setTruncated(node.doc);
            }
            const slice = ids.slice(0, FANOUT_LIMIT);
            for (const id of slice) {
              if (!isVisited(targetType, id)) {
                bucket.add(id);
                nodeCount++;
              }
            }
          } else {
            const hex = this.asHexId(val);
            if (hex && !isVisited(targetType, hex)) {
              bucket.add(hex);
              nodeCount++;
            }
          }
        }
      }

      if (nodeCount > NODE_LIMIT) {
        if (!warnedNodeLimit) {
          this.logger.warn(
            `enrich node limit exceeded ${NODE_LIMIT}; truncating further expansion`,
          );
          warnedNodeLimit = true;
        }
        // Clear plan to stop further fetches
        plan.clear();
        // mark current nodes as truncated
        for (const n of current) setTruncated(n.doc);
      }

      // Fetch
      for (const [target, ids] of plan.entries()) {
        const toFetch = Array.from(ids).filter((id) => !isVisited(target, id));
        await this.resolveBatch(target, toFetch);
        for (const id of toFetch) markVisited(target, id);
      }

      // Attach and collect next depth nodes
      const nextNodes: Node[] = [];
      for (const node of current) {
        const dtNode = await getDt(node.typeKey);
        for (const fieldKey of fieldsAtDepth) {
          const field = this.findField(dtNode, fieldKey);
          if (!field) continue;
          const constraints =
            (field['constraints'] as Record<string, unknown> | undefined) ??
            undefined;
          const targetType =
            (constraints?.['ref'] as string | undefined) || undefined;
          if (!targetType) continue;
          const pick = select[targetType];
          const outKey = `${fieldKey}Resolved`;
          const val = node.doc[fieldKey];
          if (val == null) {
            node.doc[outKey] = Array.isArray(val) ? [] : null;
            continue;
          }
          if (Array.isArray(val)) {
            const resolved = (val as unknown[])
              .map((v) => this.readFromCache(targetType, this.asHexId(v)))
              .filter((x): x is Record<string, unknown> => !!x)
              .map((x) => (pick ? this.pickFields(x, pick) : x));
            node.doc[outKey] = resolved;
            for (const child of resolved)
              nextNodes.push({ typeKey: targetType, doc: child });
          } else {
            const resolved = this.readFromCache(targetType, this.asHexId(val));
            const out = resolved
              ? pick
                ? this.pickFields(resolved, pick)
                : resolved
              : null;
            node.doc[outKey] = out;
            if (out) nextNodes.push({ typeKey: targetType, doc: out });
          }
        }
      }

      if (depth === maxDepth) break;
      current = nextNodes;
      if (current.length === 0) break;
    }

    const next = Array.isArray(ctx.result) ? items : items[0];
    return { ...ctx, result: next };
  }

  private pickFields(
    obj: Record<string, unknown>,
    fields: string[],
  ): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const k of fields) {
      if (k in obj) out[k] = obj[k];
    }
    if (obj['id']) out['id'] = obj['id'];
    return out;
  }

  private asHexId(val: unknown): string | undefined {
    if (typeof val === 'string')
      return /^[0-9a-fA-F]{24}$/.test(val) ? val.toLowerCase() : undefined;
    if (val == null) return undefined;
    let s: string | undefined;
    if (val instanceof ObjectId) s = val.toHexString();
    else if (typeof val === 'number') s = String(val);
    else return undefined;
    return /^[0-9a-fA-F]{24}$/.test(s) ? s.toLowerCase() : undefined;
  }

  private async loadDatatype(
    typeKey: string,
  ): Promise<Record<string, unknown>> {
    const col =
      await this.mongo.getCollection<Record<string, unknown>>('datatypes');
    const doc = await col.findOne({
      keyLower: typeKey.toLowerCase(),
    } as Filter<Document>);
    if (!doc) throw new Error(`Unknown datatype: ${typeKey}`);
    return doc as Record<string, unknown>;
  }

  private findField(
    dt: Record<string, unknown>,
    fieldKey: string,
  ): Record<string, unknown> | undefined {
    const fields = (dt['fields'] as unknown[]) ?? [];
    for (const f of fields) {
      const obj = f as Record<string, unknown>;
      const k = (obj['key'] as string) ?? (obj['fieldKey'] as string);
      if (k === fieldKey) return obj;
    }
    return undefined;
  }

  private async resolveBatch(targetType: string, ids: string[]): Promise<void> {
    if (!this.cache) this.cache = new Map();
    const bucket =
      this.cache.get(targetType) ?? new Map<string, Record<string, unknown>>();
    this.cache.set(targetType, bucket);
    const toFetch = ids.filter((id) => !bucket.has(id));
    if (toFetch.length === 0) return;

    const dt = await this.loadDatatype(targetType);
    const info = this.resolveCollectionInfo(dt);
    const col = await this.mongo.getCollection<Record<string, unknown>>(
      info.collection,
    );
    const filter: Filter<Document> = info.discriminator
      ? {
          _id: { $in: toFetch.map((h) => new ObjectId(h)) },
          [info.discriminator.field]: info.discriminator.value,
        }
      : { _id: { $in: toFetch.map((h) => new ObjectId(h)) } };
    const docs = await col.find(filter).toArray();
    for (const d of docs) {
      const id = d._id.toHexString();
      bucket.set(id, this.mapDoc(d));
    }
  }

  private readFromCache(
    targetType: string,
    idHex?: string,
  ): Record<string, unknown> | undefined {
    if (!idHex || !this.cache) return undefined;
    return this.cache.get(targetType)?.get(idHex);
  }

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

  private mapDoc(doc: Record<string, unknown>): Record<string, unknown> {
    const id = (
      doc._id instanceof ObjectId ? doc._id : new ObjectId(String(doc._id))
    ).toHexString();
    const out: Record<string, unknown> = { id };
    for (const [k, v] of Object.entries(doc)) {
      if (k === '_id' || k === '__type' || k === 'keyLower') continue;
      out[k] = v;
    }
    return out;
  }
}
