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
      maxDepth: { type: 'integer', minimum: 0, default: 0 },
      select: {
        type: 'object',
        additionalProperties: { type: 'array', items: { type: 'string' } },
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
    const withKeys = stepArgs['with'] as string[];
    const select = (stepArgs['select'] as Record<string, string[]>) ?? {};
    const maxDepth = Math.max(0, Number(stepArgs['maxDepth'] ?? 0));
    if (maxDepth > 0) {
      this.logger.debug?.(`maxDepth > 0 not supported; clamping to 0`);
    }

    // Only operate on afterGet/afterList with result present
    if (phase !== 'afterGet' && phase !== 'afterList') return ctx;
    if (ctx.result == null) return ctx;

    // Load current datatype to inspect ref constraints
    const dt = await this.loadDatatype(typeKey);

    const items: Record<string, unknown>[] = Array.isArray(ctx.result)
      ? (ctx.result as Record<string, unknown>[])
      : [ctx.result as Record<string, unknown>];

    // Plan: map targetType -> { ids: Set<string>, fieldKey: string[] }
    const plan = new Map<string, { ids: Set<string>; fields: string[] }>();

    for (const fieldKey of withKeys) {
      const field = this.findField(dt, fieldKey);
      if (!field) continue;
      const constraints =
        (field['constraints'] as Record<string, unknown> | undefined) ??
        undefined;
      const refVal = constraints?.['ref'] as string | undefined;
      const targetType =
        typeof refVal === 'string' && refVal.length > 0 ? refVal : undefined;
      if (!targetType) continue;

      const entry = plan.get(targetType) ?? {
        ids: new Set<string>(),
        fields: [],
      };
      if (!plan.has(targetType)) plan.set(targetType, entry);
      entry.fields.push(fieldKey);

      for (const doc of items) {
        const val = doc[fieldKey];
        if (val == null) continue;
        if (Array.isArray(val)) {
          for (const v of val) {
            const hex = this.asHexId(v);
            if (hex) entry.ids.add(hex);
          }
        } else {
          const hex = this.asHexId(val);
          if (hex) entry.ids.add(hex);
        }
      }
    }

    // Resolve per target type
    this.cache = new Map<string, Map<string, Record<string, unknown>>>();
    for (const [target, { ids }] of plan.entries()) {
      await this.resolveBatch(target, Array.from(ids));
    }

    // Attach into documents
    for (const [target, { fields }] of plan.entries()) {
      const pick = select[target];
      for (const doc of items) {
        for (const fieldKey of fields) {
          const val = doc[fieldKey];
          const outKey = `${fieldKey}Resolved`;
          if (val == null) {
            doc[outKey] = Array.isArray(val) ? [] : null;
            continue;
          }
          if (Array.isArray(val)) {
            const resolved = (val as unknown[])
              .map((v) => this.readFromCache(target, this.asHexId(v)))
              .filter((x): x is Record<string, unknown> => !!x)
              .map((x) => (pick ? this.pickFields(x, pick) : x));
            doc[outKey] = resolved;
          } else {
            const resolved = this.readFromCache(target, this.asHexId(val));
            doc[outKey] = resolved
              ? pick
                ? this.pickFields(resolved, pick)
                : resolved
              : null;
          }
        }
      }
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
