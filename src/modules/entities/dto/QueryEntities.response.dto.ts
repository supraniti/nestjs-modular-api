export interface QueryEntitiesResponseDto {
  items: Array<Record<string, unknown>>;
  page: {
    nextCursor?: string;
    limit: number;
    count: number;
    hasMore: boolean;
  };
  meta: { type: string; sort?: string[] };
}
