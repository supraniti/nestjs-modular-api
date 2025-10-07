// Minimal entity record shape returned in lists for this phase.
export interface EntityItemDto {
  id: string; // _id hex
  // dynamic fields by datatype; values are JSON-serializable

  [key: string]: any;
}

export interface ListEntitiesResponseDto {
  items: EntityItemDto[];
  page: number;
  pageSize: number;
  total: number;
}
