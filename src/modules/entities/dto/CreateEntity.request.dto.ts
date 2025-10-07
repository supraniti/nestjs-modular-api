// Payload keys must match the datatype field keys.
// We keep it open (index signature) because fields are dynamic per datatype.
export interface CreateEntityRequestDto {
  [fieldKey: string]: any;
}
