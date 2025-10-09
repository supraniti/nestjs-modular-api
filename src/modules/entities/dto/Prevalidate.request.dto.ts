export type PrevalidateMode = 'create' | 'update' | 'delete';

export interface PrevalidateRequestDto {
  type: string;
  mode: PrevalidateMode;
  payload?: Record<string, unknown>;
  identity?: { _id?: string };
  options?: {
    simulateDeleteRefChecks?: boolean;
    enforceUnique?: boolean;
  };
}
