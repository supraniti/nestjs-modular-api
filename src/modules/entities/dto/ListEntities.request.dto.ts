// Simple equality filters via querystring in this phase.
// DTO keeps names stable for future ValidationPipe usage.

export interface ListEntitiesQueryDto {
  page?: number; // default 1
  pageSize?: number; // default 20 (max 100)
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  // any other keys are treated as equality filters
  [key: string]: string | string[] | number | undefined;
}
