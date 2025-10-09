import type {
  ExplorerEndpoint,
  EntitySchemas,
  TypeRelationsDto,
} from '@lib/types/explorer';

/**
 * Response DTO for GET /api/discovery/entities/:type/schema
 */
export interface GetEntitySchemaResponseDto {
  key: string;
  label: string;
  storage: 'single' | 'perType';
  routes: ExplorerEndpoint[];
  schemas: EntitySchemas;
  relations: TypeRelationsDto;
}
