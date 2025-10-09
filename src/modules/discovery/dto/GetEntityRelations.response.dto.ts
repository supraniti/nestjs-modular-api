export interface GetEntityRelationsResponseDto {
  type: string;
  outgoing: Array<{ fieldKey: string; to: string; many: boolean }>;
  incoming: Array<{ from: string; fieldKey: string; many: boolean }>;
}
