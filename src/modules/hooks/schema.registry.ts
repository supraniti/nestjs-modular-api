import { Injectable, Logger } from '@nestjs/common';
import Ajv, { type ValidateFunction } from 'ajv';
import { MongodbService } from '../mongodb/mongodb.service';
import { buildEntitySchema } from './internal/schema.builder';

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
  key: string;
  keyLower: string;
  label: string;
  version: number;
  status: 'draft' | 'published';
  storage: 'single' | 'perType';
  fields: DatatypeField[];
}

export type AjvValidateFn = ValidateFunction;

/**
 * Builds and caches JSON Schemas + AJV validators for datatypes.
 */
@Injectable()
export class SchemaRegistry {
  private readonly ajv = new Ajv({
    strict: true,
    allErrors: true,
    useDefaults: false,
  });
  private readonly logger = new Logger(SchemaRegistry.name);

  // Cache keyed by `${typeKeyLower}@v${version}:${mode}`; mode = create|update
  private readonly cache = new Map<
    string,
    { schema: object; validate: AjvValidateFn }
  >();

  constructor(private readonly mongo: MongodbService) {}

  public async getCreate(typeKey: string): Promise<{
    schema: object;
    validate: AjvValidateFn;
  }> {
    return this.getInternal(typeKey, 'create');
  }

  public async getUpdate(typeKey: string): Promise<{
    schema: object;
    validate: AjvValidateFn;
  }> {
    return this.getInternal(typeKey, 'update');
  }

  private getCacheKey(
    keyLower: string,
    version: number,
    mode: 'create' | 'update',
  ): string {
    return `${keyLower}@v${version}:${mode}`;
  }

  private async loadDatatype(typeKey: string): Promise<DatatypeDoc> {
    const col = await this.mongo.getCollection<DatatypeDoc>('datatypes');
    const keyLower = String(typeKey).toLowerCase();
    const doc = await col.findOne({ keyLower });
    if (!doc) {
      throw new Error(`Unknown datatype for schema build: ${typeKey}`);
    }
    return doc as unknown as DatatypeDoc;
  }

  private async getInternal(
    typeKey: string,
    mode: 'create' | 'update',
  ): Promise<{ schema: object; validate: AjvValidateFn }> {
    try {
      const dt = await this.loadDatatype(typeKey);
      const key = this.getCacheKey(dt.keyLower, dt.version, mode);
      const cached = this.cache.get(key);
      if (cached) return cached;
      const schema = buildEntitySchema(dt.fields, mode);
      const validate = this.ajv.compile(schema);
      this.cache.set(key, { schema, validate });
      this.logger.debug?.(`Compiled schema cache miss for ${key}`);
      return { schema, validate };
    } catch (e) {
      throw e instanceof Error ? e : new Error(String(e));
    }
  }

  // moved: pure schema builder in internal/schema.builder.ts
}
