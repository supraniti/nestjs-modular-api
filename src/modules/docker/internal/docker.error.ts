/**
 * Lightweight DockerError for the internal Docker module.
 * Keeps error handling consistent without depending on a global AppError.
 */

export type DockerErrorCode =
  | 'DOCKER_UNAVAILABLE'
  | 'PULL_FAILED'
  | 'CREATE_FAILED'
  | 'START_FAILED'
  | 'STOP_FAILED'
  | 'RESTART_FAILED'
  | 'REMOVE_FAILED'
  | 'INSPECT_FAILED'
  | 'INVALID_ARGUMENT';

export interface DockerErrorMeta {
  operation?: string;
  containerName?: string;
  image?: string;
  cause?: unknown;
  details?: unknown;
}

export class DockerError extends Error {
  public readonly code: DockerErrorCode;
  public readonly meta: DockerErrorMeta;

  public constructor(
    code: DockerErrorCode,
    message: string,
    meta: DockerErrorMeta = {},
  ) {
    super(message);
    this.name = 'DockerError';
    this.code = code;
    this.meta = meta;
  }
}

/**
 * Utility to wrap unknown errors into DockerError with consistent metadata.
 */
export function wrapDockerError(
  code: DockerErrorCode,
  message: string,
  meta: DockerErrorMeta,
  err: unknown,
): DockerError {
  if (err instanceof DockerError) {
    // Preserve existing docker errors but augment metadata.
    return new DockerError(err.code, err.message, { ...err.meta, ...meta });
  }
  return new DockerError(code, message, { ...meta, cause: err });
}
