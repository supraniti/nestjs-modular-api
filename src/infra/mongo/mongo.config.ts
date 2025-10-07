import type { RunContainerOptions } from '@lib/docker';

/**
 * Environment variable names for Mongo infra.
 */
export const ENV_MONGO_AUTO_START = 'MONGO_AUTO_START';
export const ENV_MONGO_IMAGE = 'MONGO_IMAGE';
export const ENV_MONGO_CONTAINER_NAME = 'MONGO_CONTAINER_NAME';
export const ENV_MONGO_PORT = 'MONGO_PORT';
export const ENV_MONGO_HOST = 'MONGO_HOST';
export const ENV_MONGO_ROOT_USERNAME = 'MONGO_ROOT_USERNAME';
export const ENV_MONGO_ROOT_PASSWORD = 'MONGO_ROOT_PASSWORD';

/**
 * Strict config shape consumed by the Mongo infra bootstrap.
 */
export interface MongoInfraConfig {
  /** Orchestrate a local container automatically on app start (local dev). */
  readonly autoStart: boolean;
  /** Docker image to run. Prefer a stable tag. */
  readonly image: string;
  /** Docker container name (addressed strictly by name). */
  readonly containerName: string;
  /** Host interface used for TCP readiness check (and optional bind semantics). */
  readonly host: string;
  /** Host port to publish container 27017 to. */
  readonly port: number;
  /** Root admin username passed to the container. */
  readonly rootUsername: string;
  /** Root admin password passed to the container. */
  readonly rootPassword: string;
  /** Max time to wait for the container to be up (create/start + TCP ready). */
  readonly readinessTimeoutMs: number;
  /** Interval for TCP readiness probes. */
  readonly readinessProbeIntervalMs: number;
}

/**
 * Defaults aligned with our project contract.
 */
export const MONGO_INFRA_DEFAULTS: Readonly<MongoInfraConfig> = {
  autoStart: true,
  image: 'mongo:7',
  containerName: 'app-mongo',
  host: '127.0.0.1',
  port: 27017,
  rootUsername: 'modapi_root',
  rootPassword: 'modapi_root_dev', // dev-only fallback; override via env in real use
  readinessTimeoutMs: 60_000,
  readinessProbeIntervalMs: 500,
};

/**
 * Parse a boolean-ish env value with a sensible default.
 */
function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  const v = value.trim().toLowerCase();
  if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true;
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false;
  return fallback;
}

/**
 * Parse a positive integer env value with a sensible default.
 */
function parsePort(value: string | undefined, fallback: number): number {
  const n = value ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isFinite(n) && n > 0 && n <= 65535 ? n : fallback;
}

/**
 * Load strongly typed Mongo infra config from process.env.
 * Never throws; always returns a complete config with defaults.
 */
export function loadMongoInfraConfig(
  env: NodeJS.ProcessEnv = process.env,
): MongoInfraConfig {
  const autoStart = parseBool(
    env[ENV_MONGO_AUTO_START],
    MONGO_INFRA_DEFAULTS.autoStart,
  );
  const image =
    (env[ENV_MONGO_IMAGE] && env[ENV_MONGO_IMAGE].trim()) ||
    MONGO_INFRA_DEFAULTS.image;
  const containerName =
    (env[ENV_MONGO_CONTAINER_NAME] && env[ENV_MONGO_CONTAINER_NAME].trim()) ||
    MONGO_INFRA_DEFAULTS.containerName;
  const host =
    (env[ENV_MONGO_HOST] && env[ENV_MONGO_HOST].trim()) ||
    MONGO_INFRA_DEFAULTS.host;
  const port = parsePort(env[ENV_MONGO_PORT], MONGO_INFRA_DEFAULTS.port);
  const rootUsername =
    (env[ENV_MONGO_ROOT_USERNAME] && env[ENV_MONGO_ROOT_USERNAME].trim()) ||
    MONGO_INFRA_DEFAULTS.rootUsername;
  const rootPassword =
    (env[ENV_MONGO_ROOT_PASSWORD] && env[ENV_MONGO_ROOT_PASSWORD].trim()) ||
    MONGO_INFRA_DEFAULTS.rootPassword;

  return {
    autoStart,
    image,
    containerName,
    host,
    port,
    rootUsername,
    rootPassword,
    readinessTimeoutMs: MONGO_INFRA_DEFAULTS.readinessTimeoutMs,
    readinessProbeIntervalMs: MONGO_INFRA_DEFAULTS.readinessProbeIntervalMs,
  };
}

/**
 * Build the docker run options for our managed Mongo container.
 * Note: We bind host port -> container 27017. Binding specifically to 127.0.0.1
 * may require HostConfig.HostIp; our Docker client currently binds on all interfaces.
 * We keep host preference in config for readiness checks (TCP) and can extend
 * port binding semantics later without changing callers.
 */
export function toMongoRunOptions(cfg: MongoInfraConfig): RunContainerOptions {
  return {
    name: cfg.containerName,
    image: cfg.image,
    // Mongo will write under /data/db; our Docker client ensures /data is a persistent volume.
    env: {
      MONGO_INITDB_ROOT_USERNAME: cfg.rootUsername,
      MONGO_INITDB_ROOT_PASSWORD: cfg.rootPassword,
    },
    ports: [{ host: cfg.port, container: 27017 }],
    // We prefer containers to stay up locally between app restarts.
    restartPolicy: 'unless-stopped',
    // No extra args by default; can be extended later (e.g., --replSet)
    args: [],
    // No extra volumes beyond our enforced /data persistent mount.
    volumes: [],
  };
}

/**
 * Utility: Build a standard Mongo URI for consumers (future Mongo data module).
 * This does NOT attempt a connection; it just formats the URI using config.
 */
export function buildMongoUri(cfg: MongoInfraConfig, dbName = 'admin'): string {
  const u = encodeURIComponent(cfg.rootUsername);
  const p = encodeURIComponent(cfg.rootPassword);
  // directConnection + authSource provide a stable local connection default
  return `mongodb://${u}:${p}@${cfg.host}:${cfg.port}/${dbName}?authSource=admin&directConnection=true`;
}
