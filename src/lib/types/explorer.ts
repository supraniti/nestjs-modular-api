/* ===========================================================
   Explorer (API Discovery) — Public Types
   Strictly typed, no `any`/`unknown` in public surfaces.
   =========================================================== */

/** Supported HTTP methods for the explorer metadata. */
export type HttpMethod = 'GET' | 'POST';

/** Minimal JSON primitives allowed in examples. */
export type JsonPrimitive = string | number | boolean | null;

/* -------------------------------
   JSON Schema (narrow subset)
   ------------------------------- */

interface JsonSchemaBase {
  $schema?:
    | 'http://json-schema.org/draft-07/schema#'
    | 'https://json-schema.org/draft/2020-12/schema';
  title?: string;
  description?: string;
}

/** String schema (supports enum + common formats) */
export interface JsonSchemaString extends JsonSchemaBase {
  type: 'string';
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: 'date-time' | 'date' | 'time' | 'email' | 'uuid' | 'uri';
  enum?: string[];
  /** Vendor extension to signal a unique index at the persistence layer. */
  'x-unique'?: boolean;
  /** Vendor extension for case-insensitive enum matching. */
  'x-caseInsensitive'?: boolean;
}

/** Number schema (use type 'integer' to hint whole numbers) */
export interface JsonSchemaNumber extends JsonSchemaBase {
  type: 'number' | 'integer';
  minimum?: number;
  maximum?: number;
  multipleOf?: number; // set to 1 for integers if desired
  'x-unique'?: boolean;
}

/** Boolean schema */
export interface JsonSchemaBoolean extends JsonSchemaBase {
  type: 'boolean';
  'x-unique'?: boolean;
}

/** Array schema */
export interface JsonSchemaArray extends JsonSchemaBase {
  type: 'array';
  items: JsonSchema;
  minItems?: number;
  maxItems?: number;
}

/** Object schema */
export interface JsonSchemaObject extends JsonSchemaBase {
  type: 'object';
  properties: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
}

/** Union of supported JSON Schema node types. */
export type JsonSchema =
  | JsonSchemaString
  | JsonSchemaNumber
  | JsonSchemaBoolean
  | JsonSchemaArray
  | JsonSchemaObject;

/* -------------------------------
   Endpoint + Module descriptors
   ------------------------------- */

export interface ExplorerEndpoint {
  /** Friendly name for UI (e.g., "list", "create"). */
  name: string;
  method: HttpMethod;
  /** Full path (e.g., "/api/fields/list"). */
  path: string;

  /** Optional inline request schema (use either inline or a ref). */
  requestSchema?: JsonSchema;
  /** Optional inline success response schema (use either inline or a ref). */
  responseSchema?: JsonSchema;

  /** Optional OpenAPI component $ref (if using /api/openapi.json). */
  requestSchemaRef?: string;
  /** Optional OpenAPI component $ref (if using /api/openapi.json). */
  responseSchemaRef?: string;
}

/** Schemas specific to dynamic entity operations. */
export interface EntitySchemas {
  /** Payload schema for POST /create */
  create: JsonSchemaObject;
  /** Payload schema for POST /update */
  update: JsonSchemaObject;
  /** Querystring schema for GET /list */
  listQuery: JsonSchemaObject;
  /** Response schema for entity objects returned by get/create/update */
  entityResponse: JsonSchemaObject;
}

/** Example payloads to seed the explorer UI. */
export interface EntityExamples {
  create?: Record<string, JsonPrimitive | JsonPrimitive[]>;
  update?: Record<string, JsonPrimitive | JsonPrimitive[]>;
  listQuery?: Record<string, string | number | boolean>;
}

/** One published entity type (derived from a Datatype). */
export interface ExplorerEntityType {
  key: string; // original key (case-preserving)
  label: string;
  storage: 'single' | 'perType';
  routes: ExplorerEndpoint[];
  schemas: EntitySchemas;
  examples?: EntityExamples;
  relations?: TypeRelationsDto;
}

/** Module groups shown in the explorer. */
export interface ExplorerModulesManifest {
  fields: {
    endpoints: ExplorerEndpoint[];
  };
  datatypes: {
    endpoints: ExplorerEndpoint[];
  };
  entities: {
    types: ExplorerEntityType[];
  };
}

/** Root manifest returned by GET /api/discovery/manifest */
export interface ExplorerManifest {
  /** Version of the manifest payload shape (bump on breaking changes). */
  version: 1;
  /** API base URL (e.g., "/api"). */
  baseUrl: string;
  /** Where the full OpenAPI JSON is served (e.g., "/api/openapi.json"). */
  openapiUrl: string;
  /** Grouped modules and dynamic entity specs. */
  modules: ExplorerModulesManifest;
  /** ISO timestamp of generation (for client cache keys). */
  generatedAt: string;
  /** Optional global relations set across all types. */
  relations?: RelationEdgeDto[];
}

// New relation DTOs (Ticket K)
export type RelationCardinality = 'one' | 'many';
export type OnDeleteMode = 'restrict' | 'setNull' | 'cascade';

export interface RelationEdgeDto {
  from: string; // referencing datatype keyLower
  to: string; // referenced datatype keyLower
  fieldKey: string;
  cardinality: RelationCardinality;
  onDelete: OnDeleteMode;
}

export interface TypeRelationsDto {
  outgoing: RelationEdgeDto[];
  incoming: RelationEdgeDto[];
}
