export interface PrevalidateResponseDto {
  ok: boolean;
  errors: Array<{ path?: string; code: string; message: string }>;
  warnings: Array<{ path?: string; code: string; message: string }>;
  effects: {
    delete?: {
      restrictedBy?: Array<{ type: string; field: string; count: number }>;
      wouldUnset?: Array<{ type: string; field: string; docCount: number }>;
    };
  };
  meta: { type: string; mode: 'create' | 'update' | 'delete' };
}
