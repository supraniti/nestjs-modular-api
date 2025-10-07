export interface GetEntityResponseDto {
  id: string; // _id hex
  // dynamic fields by datatype

  [key: string]: any;
}
