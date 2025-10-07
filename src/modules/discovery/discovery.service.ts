import { Injectable } from '@nestjs/common';
import { MongodbService } from '../mongodb/mongodb.service';
import { EntitiesService } from '../entities/entities.service';
import type {
  ExplorerManifest,
  ExplorerModulesManifest,
  ExplorerEntityType,
  ExplorerEndpoint,
  EntitySchemas,
  JsonSchema,
  JsonSchemaObject,
} from '@lib/types/explorer';
import { type Collection } from 'mongodb';

/* ===========================================================
   Internal types mirroring Datatypes storage shape
   (kept file-local; no public exposure)
   =========================================================== */

type FieldBase = {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'enum';
  required?: boolean;
  array?: boolean;
  unique?: boolean;
};

type StringConstraints = {
  minLength?: number;
  maxLength?: number;
  pattern?: string;
};

type NumberConstraints = {
  min?: number;
  max?: number;
  integer?: boolean;
};

type EnumConstraints = {
  values?: string[];
  caseInsensitive?: boolean;
};

type FieldSpec = FieldBase & {
  constraints?:
    | StringConstraints
    | NumberConstraints
    | EnumConstraints
    | undefined;
};

type DatatypeDoc = {
  key: string;
  keyLower: string;
  label: string;
  version: number;
  status: 'draft' | 'published';
  storage: 'single' | 'perType';
  fields: FieldSpec[];
  indexes?: Array<Record<string, 1 | -1>>;
  createdAt?: Date;
  updatedAt?: Date;
};

/* ===========================================================
   Service
   =========================================================== */

@Injectable()
export class DiscoveryService {
  private readonly baseUrl = '/api';
  private readonly openapiUrl = '/api/openapi.json';

  constructor(
    private readonly mongo: MongodbService,
    private readonly entities: EntitiesService,
  ) {}

  /* ---------------- Manifest (all) ---------------- */

  public async getManifest(): Promise<ExplorerManifest> {
    const modules: ExplorerModulesManifest = {
      fields: { endpoints: this.fieldsEndpoints() },
      datatypes: { endpoints: this.datatypesEndpoints() },
      entities: { types: await this.loadAllEntityTypes() },
    };

    return {
      version: 1,
      baseUrl: this.baseUrl,
      openapiUrl: this.openapiUrl,
      modules,
      generatedAt: new Date().toISOString(),
    };
  }

  /* ---------------- Single-type schemas ---------------- */

  public async getEntitySchemas(typeKey: string): Promise<{
    key: string;
    label: string;
    storage: 'single' | 'perType';
    routes: ExplorerEndpoint[];
    schemas: EntitySchemas;
  }> {
    // Reuse EntitiesService guardrails (unknown/unpublished)
    const dt = await this.entities.getDatatype(typeKey);

    const routes = this.entityRoutes(dt.key);
    const schemas = this.buildEntitySchemas({
      key: dt.key,
      keyLower: dt.key.toLowerCase(),
      label: dt.label,
      storage: dt.storage,
      fields: dt.fields as FieldSpec[],
    });

    return {
      key: dt.key,
      label: dt.label,
      storage: dt.storage,
      routes,
      schemas,
    };
  }

  /* ===========================================================
     Helpers: endpoints & loaders
     =========================================================== */

  private fieldsEndpoints(): ExplorerEndpoint[] {
    const p = (suffix: string) => `${this.baseUrl}/fields/${suffix}`;
    return [
      {
        name: 'list',
        method: 'GET',
        path: p('list'),
        responseSchemaRef: '#/components/schemas/FieldsListResponse',
      },
      {
        name: 'get',
        method: 'GET',
        path: p('get'),
        requestSchemaRef: '#/components/schemas/FieldsGetQuery',
        responseSchemaRef: '#/components/schemas/FieldResponse',
      },
      {
        name: 'create',
        method: 'POST',
        path: p('create'),
        requestSchemaRef: '#/components/schemas/CreateFieldRequest',
        responseSchemaRef: '#/components/schemas/FieldResponse',
      },
      {
        name: 'update',
        method: 'POST',
        path: p('update'),
        requestSchemaRef: '#/components/schemas/UpdateFieldRequest',
        responseSchemaRef: '#/components/schemas/FieldResponse',
      },
      {
        name: 'delete',
        method: 'POST',
        path: p('delete'),
        requestSchemaRef: '#/components/schemas/DeleteFieldRequest',
        responseSchemaRef: '#/components/schemas/DeleteFieldResponse',
      },
    ];
  }

  private datatypesEndpoints(): ExplorerEndpoint[] {
    const p = (suffix: string) => `${this.baseUrl}/datatypes/${suffix}`;
    return [
      {
        name: 'list',
        method: 'GET',
        path: p('list'),
        responseSchemaRef: '#/components/schemas/DatatypesListResponse',
      },
      {
        name: 'get',
        method: 'GET',
        path: p('get'),
        requestSchemaRef: '#/components/schemas/DatatypesGetQuery',
        responseSchemaRef: '#/components/schemas/DatatypeResponse',
      },
      {
        name: 'create',
        method: 'POST',
        path: p('create'),
        requestSchemaRef: '#/components/schemas/CreateDatatypeRequest',
        responseSchemaRef: '#/components/schemas/DatatypeResponse',
      },
      {
        name: 'add-field',
        method: 'POST',
        path: p('add-field'),
        requestSchemaRef: '#/components/schemas/AddFieldRequest',
        responseSchemaRef: '#/components/schemas/DatatypeResponse',
      },
      {
        name: 'update-field',
        method: 'POST',
        path: p('update-field'),
        requestSchemaRef: '#/components/schemas/UpdateFieldRequest',
        responseSchemaRef: '#/components/schemas/DatatypeResponse',
      },
      {
        name: 'remove-field',
        method: 'POST',
        path: p('remove-field'),
        requestSchemaRef: '#/components/schemas/RemoveFieldRequest',
        responseSchemaRef: '#/components/schemas/DatatypeResponse',
      },
      {
        name: 'publish',
        method: 'POST',
        path: p('publish'),
        requestSchemaRef: '#/components/schemas/PublishDatatypeRequest',
        responseSchemaRef: '#/components/schemas/PublishDatatypeResponse',
      },
      {
        name: 'unpublish',
        method: 'POST',
        path: p('unpublish'),
        requestSchemaRef: '#/components/schemas/UnpublishDatatypeRequest',
        responseSchemaRef: '#/components/schemas/UnpublishDatatypeResponse',
      },
    ];
  }

  private entityRoutes(typeKey: string): ExplorerEndpoint[] {
    const k = encodeURIComponent(typeKey);
    const p = (suffix: string) => `${this.baseUrl}/entities/${k}/${suffix}`;
    return [
      { name: 'datatype', method: 'GET', path: p('datatype') },
      { name: 'list', method: 'GET', path: p('list') },
      { name: 'get', method: 'GET', path: p('get') },
      { name: 'create', method: 'POST', path: p('create') },
      { name: 'update', method: 'POST', path: p('update') },
      { name: 'delete', method: 'POST', path: p('delete') },
    ];
  }

  private async loadAllEntityTypes(): Promise<ExplorerEntityType[]> {
    const col: Collection<DatatypeDoc> =
      await this.mongo.getCollection<DatatypeDoc>('datatypes');

    const cursor = col.find({ status: 'published' as const });
    const docs: DatatypeDoc[] = (await cursor.toArray()) ?? [];

    const types: ExplorerEntityType[] = [];
    for (const dt of docs) {
      const routes = this.entityRoutes(dt.key);
      const schemas = this.buildEntitySchemas(dt);
      types.push({
        key: dt.key,
        label: dt.label,
        storage: dt.storage,
        routes,
        schemas,
        examples: this.buildExamples(dt),
      });
    }
    return types;
  }

  /* ===========================================================
     Schema builders
     =========================================================== */

  private buildEntitySchemas(
    dt: Pick<DatatypeDoc, 'key' | 'keyLower' | 'label' | 'storage' | 'fields'>,
  ): EntitySchemas {
    const createProps: Record<string, JsonSchema> = {};
    const updateProps: Record<string, JsonSchema> = {};
    const listProps: Record<string, JsonSchema> = {};
    const respProps: Record<string, JsonSchema> = {
      id: {
        type: 'string',
        title: 'Entity ID (Mongo ObjectId)',
        pattern: '^[0-9a-fA-F]{24}$',
      } as JsonSchema, // string schema
    };

    const requiredCreate: string[] = [];

    for (const f of dt.fields) {
      const base = this.fieldToSchema(f);
      const forUpdate = this.fieldToSchema({ ...f, required: false });
      const forFilter = this.fieldToListFilterSchema(f);
      const forResponse = this.fieldToResponseSchema(f);

      createProps[f.key] = base;
      updateProps[f.key] = forUpdate;
      respProps[f.key] = forResponse;
      if (forFilter) {
        listProps[f.key] = forFilter;
      }
      if (f.required === true && f.array !== true) {
        requiredCreate.push(f.key);
      }
    }

    // common list query props
    listProps.page = { type: 'number', minimum: 1 } as JsonSchema;
    listProps.pageSize = {
      type: 'number',
      minimum: 1,
      maximum: 100,
    } as JsonSchema;
    listProps.sortBy = { type: 'string' } as JsonSchema;
    listProps.sortDir = { type: 'string', enum: ['asc', 'desc'] } as JsonSchema;

    const create: JsonSchemaObject = {
      type: 'object',
      properties: createProps,
      required: requiredCreate.length ? requiredCreate : undefined,
      additionalProperties: false,
    };
    const update: JsonSchemaObject = {
      type: 'object',
      properties: updateProps,
      additionalProperties: false,
    };
    const listQuery: JsonSchemaObject = {
      type: 'object',
      properties: listProps,
      additionalProperties: true,
    };
    const entityResponse: JsonSchemaObject = {
      type: 'object',
      properties: respProps,
      required: ['id'],
      additionalProperties: true,
    };

    return { create, update, listQuery, entityResponse };
  }

  /** Base schema for field (create payload). */
  private fieldToSchema(f: FieldSpec): JsonSchema {
    const base = this.scalarSchema(f);
    if (f.array) {
      return {
        type: 'array',
        items: base,
      };
    }
    return base;
  }

  /** Response schema mirrors create/update but keeps scalars (array stays array). */
  private fieldToResponseSchema(f: FieldSpec): JsonSchema {
    return this.fieldToSchema(f);
  }

  /** List filter: simple equality; for arrays we allow scalar filter on the element type. */
  private fieldToListFilterSchema(f: FieldSpec): JsonSchema | undefined {
    const base = this.scalarSchema(f);
    // equality-only: expose scalar for filters even if stored as array
    return base;
  }

  /** Scalar schema builder (non-array). */
  private scalarSchema(f: FieldSpec): JsonSchema {
    switch (f.type) {
      case 'string': {
        const s: JsonSchema = {
          type: 'string',
          minLength: (f.constraints as StringConstraints | undefined)
            ?.minLength,
          maxLength: (f.constraints as StringConstraints | undefined)
            ?.maxLength,
          pattern: (f.constraints as StringConstraints | undefined)?.pattern,
        };
        if (f.unique && !f.array) {
          (s as { 'x-unique'?: boolean })['x-unique'] = true;
        }
        return s;
      }
      case 'number': {
        const nc = f.constraints as NumberConstraints | undefined;
        const integer = nc?.integer === true;
        const s: JsonSchema = {
          type: integer ? 'integer' : 'number',
          minimum: nc?.min,
          maximum: nc?.max,
          multipleOf: integer ? 1 : undefined,
        };
        if (f.unique && !f.array) {
          (s as { 'x-unique'?: boolean })['x-unique'] = true;
        }
        return s;
      }
      case 'boolean': {
        const s: JsonSchema = { type: 'boolean' };
        if (f.unique && !f.array) {
          (s as { 'x-unique'?: boolean })['x-unique'] = true;
        }
        return s;
      }
      case 'date': {
        // JSON payloads carry dates as ISO strings; backend accepts epoch/Date as well.
        const s: JsonSchema = { type: 'string', format: 'date-time' };
        if (f.unique && !f.array) {
          (s as { 'x-unique'?: boolean })['x-unique'] = true;
        }
        return s;
      }
      case 'enum': {
        const ec = f.constraints as EnumConstraints | undefined;
        const s: JsonSchema = {
          type: 'string',
          enum: ec?.values,
        };
        if (ec?.caseInsensitive === true) {
          (s as { 'x-caseInsensitive'?: boolean })['x-caseInsensitive'] = true;
        }
        if (f.unique && !f.array) {
          (s as { 'x-unique'?: boolean })['x-unique'] = true;
        }
        return s;
      }
      default: {
        // Should not happen given our field types; produce a permissive string schema.
        return { type: 'string' };
      }
    }
  }

  /* ===========================================================
     Examples for the Explorer UI
     =========================================================== */

  private buildExamples(dt: Pick<DatatypeDoc, 'fields'>): {
    create?: Record<
      string,
      string | number | boolean | null | Array<string | number | boolean | null>
    >;
    update?: Record<
      string,
      string | number | boolean | null | Array<string | number | boolean | null>
    >;
    listQuery?: Record<string, string | number | boolean>;
  } {
    const create: Record<
      string,
      string | number | boolean | null | Array<string | number | boolean | null>
    > = {};
    const update: Record<
      string,
      string | number | boolean | null | Array<string | number | boolean | null>
    > = {};
    const listQuery: Record<string, string | number | boolean> = {
      page: 1,
      pageSize: 20,
      sortBy: '_id',
      sortDir: 'asc',
    };

    for (const f of dt.fields) {
      const sample = this.sampleValue(f);
      if (f.required && !f.array) {
        create[f.key] = sample;
      } else {
        // optional fields: include in update example
        update[f.key] = sample;
      }
      // filters: prefer scalar
      listQuery[f.key] =
        typeof sample === 'object' && Array.isArray(sample)
          ? (sample[0] as string | number | boolean)
          : (sample as string | number | boolean);
    }

    return {
      create: Object.keys(create).length ? create : undefined,
      update: Object.keys(update).length ? update : undefined,
      listQuery,
    };
  }

  private sampleValue(
    f: FieldSpec,
  ):
    | string
    | number
    | boolean
    | null
    | Array<string | number | boolean | null> {
    const scalar = (): string | number | boolean | null => {
      switch (f.type) {
        case 'string': {
          if ((f.constraints as EnumConstraints | undefined)?.values?.length) {
            return (f.constraints as EnumConstraints).values![0];
          }
          return f.unique ? `${f.key.toUpperCase()}-EXAMPLE` : `${f.key} value`;
        }
        case 'number': {
          const nc = f.constraints as NumberConstraints | undefined;
          const base = nc?.integer ? 1 : 1.5;
          return typeof nc?.min === 'number' ? Math.max(nc.min, base) : base;
        }
        case 'boolean':
          return true;
        case 'date':
          return new Date(0).toISOString();
        case 'enum': {
          const ec = f.constraints as EnumConstraints | undefined;
          return ec?.values?.[0] ?? `${f.key}-enum`;
        }
        default:
          return null;
      }
    };

    if (f.array) {
      const v = scalar();
      return [v];
    }
    return scalar();
  }
}
