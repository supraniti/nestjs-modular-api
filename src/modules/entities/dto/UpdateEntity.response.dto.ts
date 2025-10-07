export interface UpdateEntityResponseDto {
  id: string;
  // Updated entity snapshot (phase 1 returns full doc; can change later).

  [key: string]: any;
}
