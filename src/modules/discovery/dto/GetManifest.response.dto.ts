import type { ExplorerManifest } from '@lib/types/explorer';

/**
 * Response DTO for GET /api/discovery/manifest
 * Thin alias over the ExplorerManifest public type.
 */
export type GetManifestResponseDto = ExplorerManifest;
