export class QueryEntitiesRequestDto {
  type!: string; // kebab-case
  filter?: string; // JSON string
  sort?: string; // comma separated: title,-createdAt
  limit?: number; // 1..100 default 50
  cursor?: string; // opaque
  page?: number; // optional alternative to cursor
  pageSize?: number; // optional
}
