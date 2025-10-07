export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type JsonPrimitive = string | number | boolean | null;

interface JsonSchemaBase {
  $schema?:
    | 'http://json-schema.org/draft-07/schema#'
    | 'https://json-schema.org/draft/2020-12/schema';
  title?: string;
  description?: string;
}

export interface JsonSchemaString extends JsonSchemaBase {
  type: 'string';
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: 'date-time' | 'date' | 'time' | 'email' | 'uuid' | 'uri';
  enum?: string[];
  'x-unique'?: boolean;
  'x-caseInsensitive'?: boolean;
}

export interface JsonSchemaNumber extends JsonSchemaBase {
  type: 'number' | 'integer';
  minimum?: number;
  maximum?: number;
  multipleOf?: number;
  'x-unique'?: boolean;
}

export interface JsonSchemaBoolean extends JsonSchemaBase {
  type: 'boolean';
  'x-unique'?: boolean;
}

export interface JsonSchemaArray extends JsonSchemaBase {
  type: 'array';
  items: JsonSchema;
  minItems?: number;
  maxItems?: number;
}

export interface JsonSchemaObject extends JsonSchemaBase {
  type: 'object';
  properties: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
}

export type JsonSchema =
  | JsonSchemaString
  | JsonSchemaNumber
  | JsonSchemaBoolean
  | JsonSchemaArray
  | JsonSchemaObject;

export interface ExplorerEndpoint {
  name: string;
  method: HttpMethod;
  path: string;
  requestSchema?: JsonSchema;
  responseSchema?: JsonSchema;
  requestSchemaRef?: string;
  responseSchemaRef?: string;
}

export interface EntitySchemas {
  create: JsonSchemaObject;
  update: JsonSchemaObject;
  listQuery: JsonSchemaObject;
  entityResponse: JsonSchemaObject;
}

export interface EntityExamples {
  create?: Record<string, JsonPrimitive | JsonPrimitive[]>;
  update?: Record<string, JsonPrimitive | JsonPrimitive[]>;
  listQuery?: Record<string, string | number | boolean>;
}

export interface ExplorerEntityType {
  key: string;
  label: string;
  storage: 'single' | 'perType';
  routes: ExplorerEndpoint[];
  schemas: EntitySchemas;
  examples?: EntityExamples;
}

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

export interface ExplorerManifest {
  version: 1;
  baseUrl: string;
  openapiUrl: string;
  modules: ExplorerModulesManifest;
  generatedAt: string;
}

export interface EntitySchemaResponse {
  key: string;
  label: string;
  storage: 'single' | 'perType';
  routes: ExplorerEndpoint[];
  schemas: EntitySchemas;
}
