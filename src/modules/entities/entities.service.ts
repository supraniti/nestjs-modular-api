import { Injectable, Optional } from '@nestjs/common';
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
  constructor(
    private readonly mongo: MongodbService,
    @Optional() private readonly hooks?: HookEngine,
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
    if (this.hooks) {
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

    // afterList hook phase (read-only; safe no-op if hooks not wired)
    if (this.hooks) {
      const ctx: HookContext = {
        payload: { query },
        result: { items, page, pageSize, total },
        meta: { typeKey: dt.keyLower },
      };
      await this.hooks.run({ typeKey: dt.keyLower, phase: 'afterList', ctx });
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

    // afterGet hook phase (read-only; safe no-op if hooks not wired)
    if (this.hooks) {
      const ctx: HookContext = {
        payload: { id },
        result: mapped,
        meta: { typeKey: dt.keyLower },
      };
      await this.hooks.run({ typeKey: dt.keyLower, phase: 'afterGet', ctx });
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

    // Validate full payload
    const validation = this.validatePayload(dt, payload, { mode: 'create' });
    if (!validation.ok)
      throw new ValidationError(dt.keyLower, validation.errors);

    // Unique pre-checks
    await this.ensureUniqueConstraints(dt, col, validation.value, undefined);

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

    // Validate only provided fields (required not enforced)
    const validation = this.validatePayload(dt, changes, { mode: 'update' });
    if (!validation.ok)
      throw new ValidationError(dt.keyLower, validation.errors);

    // Unique pre-checks (exclude current _id)
    await this.ensureUniqueConstraints(dt, col, validation.value, _id);

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
