export interface UpdateEntityRequestDto {
  id: string; // target entity id
  // Partial changes; keys must exist in the datatype definition.

  changes: Record<string, any>;
}
