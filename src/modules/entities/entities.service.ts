import {
  Injectable,
  Optional,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import type { ListEntitiesQueryDto } from './dto/ListEntities.request.dto';
import type {
  ListEntitiesResponseDto,
  EntityItemDto,
} from './dto/ListEntities.response.dto';
import type { GetDatatypeResponseDto } from './dto/GetDatatype.response.dto';
import type { GetEntityResponseDto } from './dto/GetEntity.response.dto';
import type { CreateEntityResponseDto } from './dto/CreateEntity.response.dto';
import type { UpdateEntityResponseDto } from './dto/UpdateEntity.response.dto';
import type { DeleteEntityResponseDto } from './dto/DeleteEntity.response.dto';
import {
  UnknownDatatypeError,
  UnpublishedDatatypeError,
  CollectionResolutionError,
  ValidationError,
  UniqueViolationError,
  EntityNotFoundError,
} from '../../lib/errors/EntitiesError';
import {
  ObjectId,
  type Collection,
  type Document,
  type SortDirection,
  type Filter,
  MongoServerError,
} from 'mongodb';
import { MongodbService } from '../mongodb/mongodb.service';
import { HookEngine } from '../hooks/hook.engine';
import type { HookContext } from '../hooks/types';
import { AppError } from '../../lib/errors/AppError';
import { RequestIdService } from '../hooks/request-id.service';
import { RefIntegrityService } from '../datatypes/ref-integrity.service';

/** Field/constraints shapes (phase 1) */
type FieldType = 'string' | 'number' | 'boolean' | 'date' | 'enum';
interface FieldConstraints {
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  min?: number;
  max?: number;
  integer?: boolean;
  enumValues?: string[];
  enumCaseInsensitive?: boolean;
}
interface DatatypeField {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  array?: boolean;
  unique?: boolean;
  constraints?: FieldConstraints;
  order?: number;
}

interface DatatypeDoc {
  _id: ObjectId;
  key: string;
  keyLower: string;
  label: string;
  version: number;
  status: 'draft' | 'published';
  storage: 'single' | 'perType';
  fields: DatatypeField[];
  indexes?: Array<{
    name: string;
    keys: Record<string, 1 | -1>;
    unique?: boolean;
  }>;
  createdAt?: Date;
  updatedAt?: Date;
  locked?: boolean;
}

/** Pagination defaults */
function normPage(n?: number): number {
  return typeof n === 'number' && n > 0 ? n : 1;
}
function normPageSize(n?: number): number {
  if (typeof n === 'number' && n > 0) return Math.min(n, 100);
  return 20;
}
function isHex24(s: string | undefined): s is string {
  return !!s && /^[0-9a-fA-F]{24}$/.test(s);
}

@Injectable()
export class EntitiesService {
  private readonly logger = new Logger('EntitiesService');
  constructor(
    private readonly mongo: MongodbService,
    @Optional() private readonly hooks?: HookEngine,
    @Optional() private readonly reqId?: RequestIdService,
    @Optional() private readonly refs?: RefIntegrityService,
  ) {}

  /* -----------------------------
     Datatype loading & resolution
     ----------------------------- */

  private async loadPublishedDatatype(typeKey: string): Promise<DatatypeDoc> {
    const keyLower = String(typeKey).toLowerCase();
    const datatypes = await this.mongo.getCollection<DatatypeDoc>('datatypes');
    const doc = await datatypes.findOne({ keyLower });
    if (!doc) throw new UnknownDatatypeError(keyLower);
    if (doc.status !== 'published')
      throw new UnpublishedDatatypeError(keyLower);
    return doc;
  }

  private resolveCollectionInfo(dt: DatatypeDoc): {
    collection: string;
    discriminator?: { field: string; value: string };
  } {
    if (dt.storage === 'perType') return { collection: `data_${dt.keyLower}` };
    if (dt.storage === 'single')
      return {
        collection: 'data_entities',
        discriminator: { field: '__type', value: dt.keyLower },
      };
    const rawStorage = (dt as unknown as Record<string, unknown>)['storage'];
    throw new CollectionResolutionError(
      dt.keyLower,
      `Unknown storage mode: ${String(rawStorage)}`,
    );
  }

  private async getEntitiesCollection(
    dt: DatatypeDoc,
  ): Promise<Collection<Record<string, unknown>>> {
    const { collection } = this.resolveCollectionInfo(dt);
    return this.mongo.getCollection<Record<string, unknown>>(collection);
  }

  private mapDatatypeDto(doc: DatatypeDoc): GetDatatypeResponseDto {
    return {
      id: doc._id.toHexString(),
      key: doc.key,
      label: doc.label,
      version: doc.version,
      status: doc.status,
      storage: doc.storage,
      locked: doc.locked,
      fields: doc.fields.map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type,
        required: f.required,
        array: f.array,
        unique: f.unique,
        constraints: f.constraints
          ? {
              minLength: f.constraints.minLength,
              maxLength: f.constraints.maxLength,
              pattern: f.constraints.pattern,
              min: f.constraints.min,
              max: f.constraints.max,
              integer: f.constraints.integer,
              enumValues: f.constraints.enumValues,
              enumCaseInsensitive: f.constraints.enumCaseInsensitive,
            }
          : undefined,
        // expose ref kind if present in stored doc
        kind: (
          f as unknown as {
            kind?: {
              type?: string;
              target?: string;
              cardinality?: string;
              onDelete?: string;
            };
          }
        ).kind
          ? {
              type: 'ref',
              target: String(
                (f as unknown as { kind: { target: string } }).kind.target,
              ),
              cardinality: (f as unknown as { kind?: { cardinality?: string } })
                .kind?.cardinality as 'one' | 'many' | undefined,
              onDelete: (f as unknown as { kind?: { onDelete?: string } }).kind
                ?.onDelete as 'restrict' | 'setNull' | 'cascade' | undefined,
            }
          : undefined,
        order: f.order,
      })),
      indexes: doc.indexes,
      createdAt: doc.createdAt ? doc.createdAt.toISOString() : undefined,
      updatedAt: doc.updatedAt ? doc.updatedAt.toISOString() : undefined,
    };
  }

  /* ---------------
     Public methods
     --------------- */

  async getDatatype(type: string): Promise<GetDatatypeResponseDto> {
    const dt = await this.loadPublishedDatatype(type);
    return this.mapDatatypeDto(dt);
  }

  async listEntities(
    type: string,
    query: ListEntitiesQueryDto,
  ): Promise<ListEntitiesResponseDto> {
    const dt = await this.loadPublishedDatatype(type);
    const col = await this.getEntitiesCollection(dt);

    const page = normPage(query.page);
    const pageSize = normPageSize(query.pageSize);

    const { filter, sort } = this.buildListQuery(dt, query);

    // beforeList hook phase (read-only; safe no-op if hooks not wired)
    if (this.hooks && this.hooksEnabled()) {
      const ctx: HookContext = {
        payload: { query },
        meta: { typeKey: dt.keyLower },
      };
      await this.hooks.run({ typeKey: dt.keyLower, phase: 'beforeList', ctx });
    }

    const total = await col.countDocuments(filter);
    const cursor = col
      .find(filter)
      .sort(sort)
      .skip((page - 1) * pageSize)
      .limit(pageSize);

    const itemsRaw = await cursor.toArray();
    const items: EntityItemDto[] = itemsRaw.map((doc) =>
      this.mapDocToEntityItem(dt, doc),
    );

    // afterList hook phase (may enrich items)
    if (this.hooks && this.hooksEnabled()) {
      const base = { items, page, pageSize, total };
      const ctx: HookContext = {
        payload: { query },
        result: base.items,
        meta: { typeKey: dt.keyLower },
      };
      const out = await this.hooks.run({
        typeKey: dt.keyLower,
        phase: 'afterList',
        ctx,
      });
      const enriched =
        (out?.result as EntityItemDto[] | undefined) ?? base.items;
      return { ...base, items: enriched };
    }

    return { items, page, pageSize, total };
  }

  async getEntity(type: string, id: string): Promise<GetEntityResponseDto> {
    const dt = await this.loadPublishedDatatype(type);
    if (!isHex24(id)) throw new EntityNotFoundError(dt.keyLower, String(id));
    const _id = new ObjectId(id);

    const col = await this.getEntitiesCollection(dt);
    const { discriminator } = this.resolveCollectionInfo(dt);

    // beforeGet hook phase (read-only; safe no-op if hooks not wired)
    if (this.hooks) {
      const ctx: HookContext = {
        payload: { id },
        meta: { typeKey: dt.keyLower },
      };
      await this.hooks.run({ typeKey: dt.keyLower, phase: 'beforeGet', ctx });
    }

    const filter: Filter<Document> = discriminator
      ? { _id, [discriminator.field]: discriminator.value }
      : { _id };

    const doc = await col.findOne(filter);
    if (!doc) throw new EntityNotFoundError(dt.keyLower, id);
    const mapped = this.mapDocToEntityItem(dt, doc);

    // afterGet hook phase (may enrich result)
    if (this.hooks) {
      const ctx: HookContext = {
        payload: { id },
        result: mapped,
        meta: { typeKey: dt.keyLower },
      };
      const out = await this.hooks.run({
        typeKey: dt.keyLower,
        phase: 'afterGet',
        ctx,
      });
      return (out?.result as EntityItemDto | undefined) ?? mapped;
    }

    return mapped;
  }

  async createEntity(
    type: string,
    payload: Record<string, unknown>,
  ): Promise<CreateEntityResponseDto> {
    const dt = await this.loadPublishedDatatype(type);
    const col = await this.getEntitiesCollection(dt);
    const { discriminator } = this.resolveCollectionInfo(dt);

    // Hooks: beforeCreate (validation, etc.)
    if (this.hooks && this.hooksEnabled()) {
      const ctx: HookContext = {
        payload,
        meta: { typeKey: dt.keyLower, reqId: this.reqId?.getId() },
      };
      try {
        await this.hooks.run({
          typeKey: dt.keyLower,
          phase: 'beforeCreate',
          ctx,
        });
      } catch (err) {
        // Unwrap errors propagated via HookEngine wrapper
        const cause = (err as { cause?: unknown })?.cause;
        if (cause instanceof AppError) throw cause;
        if (cause instanceof HttpException) throw cause;
        throw err;
      }
    }

    // Validate full payload
    const validation = this.validatePayload(dt, payload, { mode: 'create' });
    if (!validation.ok)
      throw new ValidationError(dt.keyLower, validation.errors);

    // Unique pre-checks
    await this.ensureUniqueConstraints(dt, col, validation.value, undefined);

    // Referential integrity: existence checks (guarded by env)
    if (this.shouldCheckRefs()) {
      await this.refs?.ensureFromDb();
      await this.ensureRefExistence(dt, validation.value);
    }

    const now = new Date();
    const toInsert: Record<string, unknown> = {
      ...validation.value,
      createdAt: now,
      updatedAt: now,
    };
    if (discriminator) toInsert[discriminator.field] = discriminator.value;

    try {
      const res = await col.insertOne(toInsert);
      const inserted = await col.findOne({ _id: res.insertedId });
      // Safety: should exist immediately; but fall back to echo id
      if (!inserted) return { id: res.insertedId.toHexString() };
      return this.mapDocToEntityItem(dt, inserted);
    } catch (err) {
      const mapped = this.mapMongoDuplicate(dt, err);
      if (mapped) throw mapped;
      throw err;
    }
  }

  async updateEntity(
    type: string,
    id: string,
    changes: Record<string, unknown>,
  ): Promise<UpdateEntityResponseDto> {
    const dt = await this.loadPublishedDatatype(type);
    if (!isHex24(id)) throw new EntityNotFoundError(dt.keyLower, String(id));
    const _id = new ObjectId(id);

    const col = await this.getEntitiesCollection(dt);
    const { discriminator } = this.resolveCollectionInfo(dt);

    // Hooks: beforeUpdate (validation, etc.)
    if (this.hooks && this.hooksEnabled()) {
      const ctx: HookContext = {
        payload: changes,
        meta: { typeKey: dt.keyLower, reqId: this.reqId?.getId() },
      };
      try {
        await this.hooks.run({
          typeKey: dt.keyLower,
          phase: 'beforeUpdate',
          ctx,
        });
      } catch (err) {
        const cause = (err as { cause?: unknown })?.cause;
        if (cause instanceof AppError) throw cause;
        if (cause instanceof HttpException) throw cause;
        throw err;
      }
    }

    // Validate only provided fields (required not enforced)
    const validation = this.validatePayload(dt, changes, { mode: 'update' });
    if (!validation.ok)
      throw new ValidationError(dt.keyLower, validation.errors);

    // Unique pre-checks (exclude current _id)
    await this.ensureUniqueConstraints(dt, col, validation.value, _id);

    // Referential integrity: existence checks on provided ref fields
    if (this.shouldCheckRefs()) {
      await this.refs?.ensureFromDb();
      await this.ensureRefExistence(dt, validation.value);
    }

    const filter: Filter<Document> = discriminator
      ? { _id, [discriminator.field]: discriminator.value }
      : { _id };

    const update: Record<string, unknown> = {
      $set: { ...validation.value, updatedAt: new Date() },
    };

    try {
      const res = await col.updateOne(filter, update);
      if (res.matchedCount === 0)
        throw new EntityNotFoundError(dt.keyLower, id);
      const after = await col.findOne(filter);
      if (!after) throw new EntityNotFoundError(dt.keyLower, id);
      return this.mapDocToEntityItem(dt, after);
    } catch (err) {
      const mapped = this.mapMongoDuplicate(dt, err);
      if (mapped) throw mapped;
      throw err;
    }
  }

  async deleteEntity(
    type: string,
    id: string,
  ): Promise<DeleteEntityResponseDto> {
    const dt = await this.loadPublishedDatatype(type);
    if (!isHex24(id)) throw new EntityNotFoundError(dt.keyLower, String(id));
    const _id = new ObjectId(id);

    const col = await this.getEntitiesCollection(dt);
    const { discriminator } = this.resolveCollectionInfo(dt);

    const filter: Filter<Document> = discriminator
      ? { _id, [discriminator.field]: discriminator.value }
      : { _id };

    // onDelete behaviors (guarded by env)
    if (this.shouldRunOnDelete() && this.refs) {
      await this.refs.ensureFromDb();
      await this.applyOnDelete(dt, _id);
    }

    const res = await col.deleteOne(filter);
    if (res.deletedCount === 0) throw new EntityNotFoundError(dt.keyLower, id);
    return { deleted: true };
  }

  /* -------------------
     Helper: list query
     ------------------- */

  private buildListQuery(
    dt: DatatypeDoc,
    query: ListEntitiesQueryDto,
  ): { filter: Filter<Document>; sort: Record<string, SortDirection> } {
    const { discriminator } = this.resolveCollectionInfo(dt);
    const filter: Filter<Document> = {};
    if (discriminator) {
      filter[discriminator.field] = discriminator.value;
    }

    // Reserved keys for pagination/sort
    const reserved = new Set(['page', 'pageSize', 'sortBy', 'sortDir']);

    // Equality filters from querystring
    for (const [k, v] of Object.entries(query)) {
      if (reserved.has(k)) continue;
      if (v == null) continue;
      // Accept string or string[] or number (from DTO)
      if (Array.isArray(v)) {
        filter[k] = { $in: v };
      } else {
        filter[k] = v;
      }
    }

    const sortBy = typeof query.sortBy === 'string' ? query.sortBy : '_id';
    const sortDir: SortDirection = query.sortDir === 'desc' ? -1 : 1;

    return { filter, sort: { [sortBy]: sortDir } };
  }

  /* -------------------------
     Helper: unique pre-checks
     ------------------------- */

  private async ensureUniqueConstraints(
    dt: DatatypeDoc,
    col: Collection<Record<string, unknown>>,
    doc: Record<string, unknown>,
    excludeId?: ObjectId,
  ): Promise<void> {
    const uniqueFields = dt.fields.filter((f) => !!f.unique && !f.array);
    if (uniqueFields.length === 0) return;

    for (const f of uniqueFields) {
      const val = doc[f.key];
      if (val === undefined || val === null) continue;
      const { discriminator } = this.resolveCollectionInfo(dt);

      const filter: Filter<Document> = discriminator
        ? {
            [f.key]: val as unknown,
            [discriminator.field]: discriminator.value,
          }
        : { [f.key]: val as unknown };

      if (excludeId) {
        filter._id = { $ne: excludeId } as unknown as ObjectId;
      }

      const exists = await col.findOne(filter, { projection: { _id: 1 } });
      if (exists) throw new UniqueViolationError(dt.keyLower, f.key, val);
    }
  }

  private mapMongoDuplicate(
    dt: DatatypeDoc,
    err: unknown,
  ): UniqueViolationError | null {
    // Handle server-side dup key error as a final guard
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as MongoServerError).code === 11000
    ) {
      const e = err as MongoServerError;
      // Best-effort parse field from errmsg or keyPattern if present
      let field = 'unknown';
      if (e.keyPattern && typeof e.keyPattern === 'object') {
        const keys = Object.keys(e.keyPattern as Record<string, unknown>);
        if (keys.length) field = keys[0]!;
      } else if (typeof e.message === 'string') {
        const m = e.message.match(/index: [^_]*_(\w+)/); // e.g., uniq_type_field
        if (m && m[1]) field = m[1];
      }
      return new UniqueViolationError(dt.keyLower, field, undefined);
    }
    return null;
  }

  /* ------------------------
     Query API (cursor or page)
     ------------------------ */

  public async queryEntities(q: {
    type: string;
    filter?: string;
    sort?: string;
    limit?: number;
    cursor?: string;
    page?: number;
    pageSize?: number;
  }): Promise<
    import('./dto/QueryEntities.response.dto').QueryEntitiesResponseDto
  > {
    const dt = await this.loadPublishedDatatype(q.type);
    const col = await this.getEntitiesCollection(dt);
    const limit = Math.min(Math.max(1, Number(q.limit ?? 50)), 100);
    const usingPage = q.page != null || q.pageSize != null;
    if (q.cursor && usingPage) {
      throw new BadRequestException({
        ok: false,
        error: {
          code: 'BadQuery',
          message: 'invalid JSON in filter',
        },
      });
    }

    const filter = this.sanitizeFilter(q.filter);
    const sortFields = this.parseSort(q.sort);

    const findFilter: Filter<Document> = { ...filter } as Filter<Document>;
    const { discriminator } = this.resolveCollectionInfo(dt);
    if (discriminator)
      findFilter[discriminator.field] =
        discriminator.value as unknown as string;

    const cursorSort: Record<string, 1 | -1> = {};
    for (const s of sortFields) cursorSort[s.field] = s.dir === 'asc' ? 1 : -1;
    if (!sortFields.some((s) => s.field === '_id')) cursorSort['_id'] = 1;

    const mongoCursor = col
      .find(findFilter)
      .sort(cursorSort)
      .limit(limit + 1);
    const docs = await mongoCursor.toArray();
    const items = docs
      .slice(0, limit)
      .map((d) => this.mapDocToEntityItem(dt, d));
    const hasMore = docs.length > limit;
    const nextCursor = hasMore
      ? this.encodeCursor(
          items[items.length - 1] as Record<string, unknown>,
          sortFields,
        )
      : undefined;
    return {
      items,
      page: { nextCursor, limit, count: items.length, hasMore },
      meta: {
        type: dt.key,
        sort: sortFields.map((s) =>
          s.dir === 'asc' ? s.field : `-${s.field}`,
        ),
      },
    };
  }

  private sanitizeFilter(raw: string | undefined): Filter<Document> {
    if (!raw) return {} as Filter<Document>;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new BadRequestException({
        ok: false,
        error: {
          code: 'BadQuery',
          message: 'invalid JSON in filter',
        },
      });
    }
    const allowedOps = new Set([
      '$eq',
      '$ne',
      '$in',
      '$nin',
      '$gt',
      '$gte',
      '$lt',
      '$lte',
      '$regex',
      '$exists',
    ]);
    const walk = (node: unknown): unknown => {
      if (node === null || typeof node !== 'object') return node;
      const obj = node as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) {
        if (k.startsWith('$')) {
          if (!allowedOps.has(k)) continue;
          if (k === '$regex') {
            if (typeof v !== 'string') continue;
            out['$regex'] = v;
          } else if (k === '$exists') {
            out['$exists'] = v === true;
          } else if (k === '$in' || k === '$nin') {
            out[k] = Array.isArray(v) ? v : [];
          } else {
            out[k] = v;
          }
        } else {
          out[k] = walk(v);
        }
      }
      return out;
    };
    const result = walk(parsed) as Record<string, unknown>;
    return result as Filter<Document>;
  }

  private parseSort(
    raw?: string,
  ): Array<{ field: string; dir: 'asc' | 'desc' }> {
    if (!raw) return [{ field: '_id', dir: 'asc' }];
    const parts = String(raw)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const out: Array<{ field: string; dir: 'asc' | 'desc' }> = [];
    for (const p of parts) {
      if (p.startsWith('-')) out.push({ field: p.slice(1), dir: 'desc' });
      else out.push({ field: p, dir: 'asc' });
    }
    return out.length ? out : [{ field: '_id', dir: 'asc' }];
  }

  private encodeCursor(
    item: Record<string, unknown>,
    sort: Array<{ field: string; dir: 'asc' | 'desc' }>,
  ): string {
    const payload = {
      _id: typeof item['id'] === 'string' ? item['id'] : '',
      sort: sort.map((s) => (s.dir === 'asc' ? s.field : `-${s.field}`)),
    };
    const json = JSON.stringify(payload);
    return Buffer.from(json).toString('base64url');
  }
  private decodeCursor(
    cur: string,
  ): { _id?: string; sort?: string[] } | undefined {
    try {
      const json = Buffer.from(String(cur), 'base64url').toString('utf8');
      const obj = JSON.parse(json) as unknown;
      if (obj && typeof obj === 'object') {
        const o = obj as { _id?: unknown; sort?: unknown };
        const _id = typeof o._id === 'string' ? o._id : undefined;
        const sort = Array.isArray(o.sort)
          ? o.sort.filter((s) => typeof s === 'string')
          : undefined;
        return { _id, sort };
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  /* ------------------------
     Prevalidate API
     ------------------------ */

  public async prevalidate(
    req: import('./dto/Prevalidate.request.dto').PrevalidateRequestDto,
  ): Promise<import('./dto/Prevalidate.response.dto').PrevalidateResponseDto> {
    const mode = req.mode;
    const dt = await this.loadPublishedDatatype(req.type);
    const col = await this.getEntitiesCollection(dt);
    const out: import('./dto/Prevalidate.response.dto').PrevalidateResponseDto =
      {
        ok: true,
        errors: [],
        warnings: [],
        effects: {},
        meta: { type: dt.key, mode },
      };
    if (mode === 'create' || mode === 'update') {
      const payload = req.payload ?? {};
      const validation = this.validatePayload(dt, payload, { mode: mode });
      if (!validation.ok) {
        out.ok = false;
        out.errors.push({
          code: 'VALIDATION_FAILED',
          message: 'Payload invalid',
        });
        return out;
      }
      if (req.options?.enforceUnique) {
        try {
          await this.ensureUniqueConstraints(
            dt,
            col,
            validation.value,
            undefined,
          );
        } catch (e) {
          out.ok = false;
          out.errors.push({ code: 'UNIQUE', message: (e as Error).message });
        }
      }
      return out;
    }
    if (mode === 'delete') {
      const id = req.identity?._id;
      if (!id || !isHex24(id)) {
        out.ok = false;
        out.errors.push({
          code: 'BadIdentity',
          message: 'identity._id required',
        });
        return out;
      }
      await this.refs?.ensureFromDb();
      const edges = this.refs?.getIncoming(dt.keyLower) ?? [];
      const db = await this.mongo.getDb();
      const effects = {
        delete: { restrictedBy: [] as any[], wouldUnset: [] as any[] },
      };
      for (const edge of edges) {
        const dts = db.collection<Record<string, unknown>>('datatypes');
        const fromDt = await dts.findOne({
          keyLower: edge.from,
        } as Filter<Document>);
        if (!fromDt) continue;
        const info = this.resolveCollectionInfoAny(
          fromDt as Record<string, unknown>,
        );
        const c = db.collection<Record<string, unknown>>(info.collection);
        const hex = id;
        const baseFilter: Filter<Document> = info.discriminator
          ? {
              $or: [
                { [edge.fieldKey]: new ObjectId(hex) },
                { [edge.fieldKey]: hex },
                { [edge.fieldKey]: { $in: [new ObjectId(hex), hex] } },
              ],
              [info.discriminator.field]: info.discriminator.value,
            }
          : {
              $or: [
                { [edge.fieldKey]: new ObjectId(hex) },
                { [edge.fieldKey]: hex },
                { [edge.fieldKey]: { $in: [new ObjectId(hex), hex] } },
              ],
            };
        const count = await c.countDocuments(baseFilter, { limit: 1001 });
        if (edge.onDelete === 'restrict' && count > 0) {
          effects.delete.restrictedBy.push({
            type: edge.from,
            field: edge.fieldKey,
            count,
          });
        } else if (edge.onDelete === 'setNull' && !edge.many && count > 0) {
          effects.delete.wouldUnset.push({
            type: edge.from,
            field: edge.fieldKey,
            docCount: count,
          });
        }
      }
      out.effects = effects;
      return out;
    }
    return out;
  }

  /* ------------------------
     Helper: ref integrity
     ------------------------ */

  private shouldCheckRefs(): boolean {
    const v = (process.env.DATATYPES_REF_CHECK ?? '1').toLowerCase();
    return v === '1' || v === 'true';
  }
  private shouldRunOnDelete(): boolean {
    const p = (process.env.INTEGRITY_ENFORCE ?? '').toLowerCase();
    if (p === '1' || p === 'true') return true;
    const legacy = (process.env.DATATYPES_ONDELETE ?? '1').toLowerCase();
    return legacy === '1' || legacy === 'true';
  }

  private hooksEnabled(): boolean {
    const v = (process.env.HOOKS_ENABLE ?? '1').toLowerCase();
    return v === '1' || v === 'true';
  }

  private async ensureRefExistence(
    dt: DatatypeDoc,
    doc: Record<string, unknown>,
  ): Promise<void> {
    if (!this.refs) return;
    // Build ref field specs from stored doc fields (tolerate extra properties)
    const fields = (dt.fields as unknown[] | undefined) ?? [];
    for (const f of fields) {
      const rec = f as Record<string, unknown>;
      const rawKey = rec['key'] ?? rec['fieldKey'];
      if (typeof rawKey !== 'string' || rawKey.trim().length === 0) continue;
      const fieldKey = rawKey.trim();
      const kind = rec['kind'] as
        | { type?: string; target?: string; cardinality?: 'one' | 'many' }
        | undefined;
      if (!kind || kind.type !== 'ref') continue;
      const target = String(kind.target ?? '').toLowerCase();
      if (!target) continue;
      const many = kind.cardinality
        ? kind.cardinality === 'many'
        : rec['array'] === true;

      const raw = doc[fieldKey];
      if (raw === undefined) continue; // absent in payload (partial update)
      if (raw === null) {
        // allow null unless field is required: validation already handled required rules
        continue;
      }

      const ids: import('mongodb').ObjectId[] = [];
      if (many) {
        if (!Array.isArray(raw) || raw.length === 0) continue; // empty arrays are allowed
        for (const v of raw) {
          const oid = this.asObjectIdOrNull(v);
          if (oid) ids.push(oid);
        }
      } else {
        const oid = this.asObjectIdOrNull(raw);
        if (oid) ids.push(oid);
      }
      if (ids.length === 0) continue;

      const missing = await this.refs.existsMany(target, ids);
      if (missing.size > 0) {
        const missingList = Array.from(missing);
        // BadRequest with structured error
        throw new HttpException(
          {
            code: 'RefMissing',
            field: fieldKey,
            target,
            missing: missingList,
          },
          HttpStatus.BAD_REQUEST,
        );
      }
    }
  }

  private asObjectIdOrNull(val: unknown): ObjectId | null {
    if (val == null) return null;
    try {
      if (val instanceof ObjectId) return val;
      const s = typeof val === 'string' ? val : undefined;
      if (!s) return null;
      return /^[0-9a-fA-F]{24}$/.test(s) ? new ObjectId(s) : null;
    } catch {
      return null;
    }
  }

  private async applyOnDelete(
    dt: DatatypeDoc,
    sourceId: ObjectId,
  ): Promise<void> {
    if (!this.refs) return;
    const incoming = this.refs.getIncoming(dt.keyLower);
    this.logger.debug?.(
      `applyOnDelete for ${dt.keyLower}: ${incoming.length} incoming edge(s)`,
    );
    if (incoming.length === 0) return;

    const db = await this.mongo.getDb();
    const maxBatch = Math.max(
      1,
      Number.parseInt(process.env.DATATYPES_ONDELETE_MAX ?? '1000', 10) || 1000,
    );

    for (const edge of incoming) {
      const dts = db.collection<Record<string, unknown>>('datatypes');
      const fromDt = await dts.findOne({
        keyLower: edge.from,
      } as Filter<Document>);
      if (!fromDt) continue;
      const info = this.resolveCollectionInfoAny(
        fromDt as Record<string, unknown>,
      );
      const col = db.collection<Record<string, unknown>>(info.collection);

      const hex = sourceId.toHexString();
      const orFilter = [
        { [edge.fieldKey]: sourceId } as Filter<Document>,
        { [edge.fieldKey]: hex } as Filter<Document>,
        { [edge.fieldKey]: { $in: [sourceId, hex] } } as Filter<Document>,
      ];
      const baseFilter: Filter<Document> = info.discriminator
        ? {
            $or: orFilter,
            [info.discriminator.field]: info.discriminator.value,
          }
        : { $or: orFilter };

      if (edge.onDelete === 'restrict') {
        const exists = await col.findOne(baseFilter, {
          projection: { _id: 1 },
        });
        if (exists) {
          throw new HttpException(
            {
              code: 'RefRestrict',
              type: edge.from,
              field: edge.fieldKey,
              count: 1,
              mode: 'restrict',
            },
            HttpStatus.CONFLICT,
          );
        }
        continue;
      }

      if (edge.onDelete === 'setNull') {
        // Batch loop
        for (;;) {
          const ids = await col
            .find(baseFilter, { projection: { _id: 1 } })
            .limit(maxBatch)
            .toArray();
          if (ids.length === 0) break;
          const idList = ids.map((d) => d._id as unknown as ObjectId);
          const filter: Filter<Document> = info.discriminator
            ? {
                _id: { $in: idList },
                [info.discriminator.field]: info.discriminator.value,
              }
            : { _id: { $in: idList } };
          const update = edge.many
            ? { $pull: { [edge.fieldKey]: { $in: [sourceId, hex] } } }
            : { $set: { [edge.fieldKey]: null } };
          await col.updateMany(filter, update as unknown as Document);
          if (ids.length < maxBatch) break;
        }
        continue;
      }

      if (edge.onDelete === 'cascade') {
        let totalDeleted = 0;
        for (;;) {
          const ids = await col
            .find(baseFilter, { projection: { _id: 1 } })
            .limit(maxBatch)
            .toArray();
          if (ids.length === 0) break;
          const idList = ids.map((d) => d._id as unknown as ObjectId);
          const filter: Filter<Document> = info.discriminator
            ? {
                _id: { $in: idList },
                [info.discriminator.field]: info.discriminator.value,
              }
            : { _id: { $in: idList } };
          const res = await col.deleteMany(filter);
          totalDeleted += res.deletedCount ?? 0;
          if (ids.length < maxBatch) break;
        }
        this.logger.log?.(
          `onDelete=cascade removed ${totalDeleted} ${edge.from} referencing ${dt.keyLower}`,
        );
        continue;
      }
    }
  }

  private resolveCollectionInfoAny(dt: Record<string, unknown>): {
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

  /* ------------------------
     Helper: validation core
     ------------------------ */

  private validatePayload(
    dt: DatatypeDoc,
    input: Record<string, unknown>,
    opts: { mode: 'create' | 'update' },
  ):
    | { ok: true; value: Record<string, unknown> }
    | { ok: false; errors: Record<string, unknown> } {
    const errors: Record<string, unknown> = {};
    const out: Record<string, unknown> = {};

    const fieldsByKey = new Map<string, DatatypeField>(
      dt.fields.map((f) => [f.key, f]),
    );

    // Required fields (create only)
    if (opts.mode === 'create') {
      for (const f of dt.fields) {
        if (f.required && input[f.key] == null) {
          errors[f.key] = 'required';
        }
      }
    }

    // Validate incoming keys (only keys defined in datatype pass through)
    for (const [k, rawVal] of Object.entries(input)) {
      const f = fieldsByKey.get(k);
      if (!f) {
        // Unknown field key: ignore silently (keeps model strictness)
        continue;
      }

      const res = f.array
        ? this.coerceValidateArray(f, rawVal)
        : this.coerceValidateScalar(f, rawVal);

      if (!res.ok) {
        errors[k] = res.error;
      } else {
        out[k] = res.value;
      }
    }

    if (Object.keys(errors).length) {
      return { ok: false, errors };
    }
    return { ok: true, value: out };
  }

  private coerceValidateArray(
    f: DatatypeField,
    val: unknown,
  ): { ok: true; value: unknown[] } | { ok: false; error: string } {
    if (!Array.isArray(val)) return { ok: false, error: 'expected_array' };
    const out: unknown[] = [];
    for (const item of val) {
      const res = this.coerceValidateScalar(f, item);
      if (!res.ok) return { ok: false, error: `invalid_element:${res.error}` };
      out.push(res.value);
    }
    return { ok: true, value: out };
  }

  private coerceValidateScalar(
    f: DatatypeField,
    val: unknown,
  ): { ok: true; value: unknown } | { ok: false; error: string } {
    switch (f.type) {
      case 'string': {
        if (typeof val !== 'string')
          return { ok: false, error: 'expected_string' };
        if (
          f.constraints?.minLength != null &&
          val.length < f.constraints.minLength
        )
          return { ok: false, error: 'minLength' };
        if (
          f.constraints?.maxLength != null &&
          val.length > f.constraints.maxLength
        )
          return { ok: false, error: 'maxLength' };
        if (f.constraints?.pattern) {
          try {
            const re = new RegExp(f.constraints.pattern);
            if (!re.test(val)) return { ok: false, error: 'pattern' };
          } catch {
            // Invalid pattern configured; treat as server misconfig but do not block user
          }
        }
        return { ok: true, value: val };
      }
      case 'number': {
        const n = typeof val === 'number' ? val : Number(val);
        if (!Number.isFinite(n)) return { ok: false, error: 'expected_number' };
        if (f.constraints?.integer && !Number.isInteger(n))
          return { ok: false, error: 'integer' };
        if (f.constraints?.min != null && n < f.constraints.min)
          return { ok: false, error: 'min' };
        if (f.constraints?.max != null && n > f.constraints.max)
          return { ok: false, error: 'max' };
        return { ok: true, value: n };
      }
      case 'boolean': {
        if (typeof val === 'boolean') return { ok: true, value: val };
        if (val === 'true') return { ok: true, value: true };
        if (val === 'false') return { ok: true, value: false };
        return { ok: false, error: 'expected_boolean' };
      }
      case 'date': {
        const d =
          val instanceof Date
            ? val
            : new Date(typeof val === 'number' ? val : String(val));
        if (Number.isNaN(d.getTime()))
          return { ok: false, error: 'expected_date' };
        return { ok: true, value: d };
      }
      case 'enum': {
        if (typeof val !== 'string')
          return { ok: false, error: 'expected_string' };
        const values = f.constraints?.enumValues ?? [];
        const ci = !!f.constraints?.enumCaseInsensitive;
        const ok = ci
          ? values.some((v) => v.toLowerCase() === val.toLowerCase())
          : values.includes(val);
        return ok ? { ok: true, value: val } : { ok: false, error: 'enum' };
      }
      default:
        return { ok: false, error: 'unsupported_type' };
    }
  }

  /* ------------------------
     Helper: DTO mapping
     ------------------------ */

  private mapDocToEntityItem(
    dt: DatatypeDoc,
    doc: Record<string, unknown>,
  ): EntityItemDto {
    const id = (
      doc._id instanceof ObjectId ? doc._id : new ObjectId(String(doc._id))
    ).toHexString();

    // Shallow clone to avoid mutating the source
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(doc)) {
      if (k === '_id') continue;
      if (k === '__type') continue; // hide discriminator
      out[k] = v;
    }
    return { id, ...out } as EntityItemDto;
  }
}
