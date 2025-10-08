/**
 * Strict types and constants for the internal Docker module.
 * No side effects; DTOs and config defaults only.
 */

/** Label applied to every container we manage for safe filtering. */
export const DOCKER_LABEL_KEY = 'com.modular-api.managed';
export const DOCKER_LABEL_VALUE = 'true';

/** Root data folders (relative to the repository root). */
export const APPLICATION_DATA_DIR = 'ApplicationData';
export const CONTAINERS_DATA_DIR = 'containers';

/** Environment variable gate used by e2e tests. */
export const ENV_DOCKER_E2E = 'DOCKER_E2E';

/** Default operation timeouts (ms). Tune as needed. */
export const DEFAULT_PULL_TIMEOUT_MS = 60_000; // pull can be slow on first run
export const DEFAULT_CREATE_TIMEOUT_MS = 20_000;
export const DEFAULT_START_TIMEOUT_MS = 20_000;
export const DEFAULT_STOP_TIMEOUT_MS = 20_000;
export const DEFAULT_RESTART_TIMEOUT_MS = 25_000;
export const DEFAULT_REMOVE_TIMEOUT_MS = 20_000;
export const DEFAULT_INSPECT_TIMEOUT_MS = 10_000;

export type PullPolicy = 'always' | 'ifNotPresent';

export type Protocol = 'tcp' | 'udp';

export interface PortMapping {
  /** Host port to bind (e.g., 27017). */
  host: number;
  /** Container port (e.g., 27017). */
  container: number;
  /** Protocol (defaults to tcp). */
  protocol?: Protocol;
}

export interface VolumeMapping {
  /** Absolute or repo-relative host folder path. */
  hostPath: string;
  /** Container path to mount into. */
  containerPath: string;
  /** Read-only mount flag (defaults to false). */
  readOnly?: boolean;
}

export interface RunContainerOptions {
  /** Unique container name. All actions address containers strictly by name. */
  name: string;

  /** Image reference, e.g., "mongo:7". */
  image: string;

  /** Optional environment variables. */
  env?: Record<string, string>;

  /** Optional published ports. */
  ports?: PortMapping[];

  /** Optional additional mounts (a persistent per-container host folder is always added automatically). */
  volumes?: VolumeMapping[];

  /** Extra arguments passed after the image (ENTRYPOINT/CMD args). */
  args?: string[];

  /** Pull behavior prior to (re)create/start. Defaults to "ifNotPresent". */
  pullPolicy?: PullPolicy;

  /** Docker restart policy (defaults to "no"). */
  restartPolicy?: 'no' | 'on-failure' | 'always' | 'unless-stopped';
}

/** High-level container lifecycle statuses we expose internally. */
export type ContainerStatus =
  | 'not-found'
  | 'created'
  | 'running'
  | 'exited'
  | 'paused'
  | 'dead'
  | 'removing';

/** Port description we return in state responses. */
export interface ExposedPort {
  container: number;
  host?: number;
  protocol: Protocol;
}

/** Inspect/state DTO we expose to other modules. */
export interface ContainerStateInfo {
  name: string;
  id: string | null;
  status: ContainerStatus;
  startedAt: string | null; // ISO-8601 if available
  finishedAt: string | null; // ISO-8601 if available
  exitCode: number | null;
  ports: ExposedPort[];
  labels: Record<string, string>;
}

/** Result returned by run(). */
export interface RunContainerResult {
  name: string;
  id: string;
  status: 'created' | 'running';
  warnings: string[];
}

/** Result returned by stop()/restart()/remove(). */
export interface ActionResult {
  name: string;
  id: string | null;
  status: ContainerStatus;
  message?: string;
}

/** Internal normalized create/start options passed to the client. */
export interface ClientCreateOptions {
  name: string;
  image: string;
  env: string[]; // ["KEY=VALUE", ...]
  binds: string[]; // ["C:\\host\\path:/container/path:rw", ...]
  portBindings: Record<string, Array<{ HostPort: string }>>; // {"27017/tcp":[{HostPort:"27017"}]}
  labels: Record<string, string>;
  restartPolicy: 'no' | 'on-failure' | 'always' | 'unless-stopped';
  args: string[];
}
