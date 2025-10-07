// Published datatype shape returned to clients.
// Mirrors the Datatypes module client-facing mapping (compact and safe).
export interface GetDatatypeResponseDto {
  id: string; // _id.toHexString()
  key: string;
  label: string;
  version: number;
  status: 'draft' | 'published';
  storage: 'single' | 'perType';
  locked?: boolean;

  // Minimal field descriptor for this phase.
  fields: Array<{
    key: string;
    label: string;
    type: 'string' | 'number' | 'boolean' | 'date' | 'enum';
    required?: boolean;
    array?: boolean;
    unique?: boolean;
    // Field-type constraints (subset; phase 1).
    constraints?: {
      minLength?: number;
      maxLength?: number;
      pattern?: string;
      min?: number;
      max?: number;
      integer?: boolean;
      enumValues?: string[];
      enumCaseInsensitive?: boolean;
    };
    order?: number;
  }>;

  // Indexes summary (optional)
  indexes?: Array<{
    name: string;
    keys: Record<string, 1 | -1>;
    unique?: boolean;
  }>;

  createdAt?: string; // ISO
  updatedAt?: string; // ISO
}
