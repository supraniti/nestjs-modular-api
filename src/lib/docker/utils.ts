import * as fs from 'fs';
import * as path from 'path';
import {
  APPLICATION_DATA_DIR,
  CONTAINERS_DATA_DIR,
  PortMapping,
} from './types';

/**
 * Resolve the repository root.
 * Assumes process.cwd() is the project root when running tests/app locally.
 */
export function getRepoRoot(): string {
  return path.resolve(process.cwd());
}

/**
 * ApplicationData root: <repo-root>/ApplicationData
 */
export function getApplicationDataRoot(): string {
  return path.join(getRepoRoot(), APPLICATION_DATA_DIR);
}

/**
 * Persistent container data dir:
 * <repo-root>/ApplicationData/containers/<name>
 */
export function getContainerDataDir(name: string): string {
  return path.join(getApplicationDataRoot(), CONTAINERS_DATA_DIR, name);
}

/**
 * Ensure a directory exists (mkdir -p).
 */
export function ensureDirSync(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Ensure all required data folders for a container exist.
 * Returns the absolute host folder path that must be bind-mounted.
 */
export function ensureContainerDataDir(name: string): string {
  const root = getApplicationDataRoot();
  ensureDirSync(root);

  const containersRoot = path.join(root, CONTAINERS_DATA_DIR);
  ensureDirSync(containersRoot);

  const containerDir = path.join(containersRoot, name);
  ensureDirSync(containerDir);

  return containerDir;
}

/**
 * Convert env object to ["KEY=VALUE", ...].
 */
export function envObjectToList(
  env: Record<string, string> | undefined,
): string[] {
  if (!env) return [];
  return Object.entries(env).map(([k, v]) => `${k}=${String(v)}`);
}

/**
 * Build docker port bindings object from a list of mappings.
 * Format: { "27017/tcp": [{ HostPort: "27017" }], ... }
 */
export function toPortBindings(
  ports: PortMapping[] | undefined,
): Record<string, Array<{ HostPort: string }>> {
  const result: Record<string, Array<{ HostPort: string }>> = {};
  if (!ports || ports.length === 0) return result;

  for (const p of ports) {
    const proto = p.protocol ?? 'tcp';
    const key = `${p.container}/${proto}`;
    const hostPort = String(p.host);
    if (!result[key]) {
      result[key] = [];
    }
    result[key].push({ HostPort: hostPort });
  }
  return result;
}

/**
 * Create a Docker bind mount spec string: "<hostPath>:<containerPath>:<mode>"
 * On Windows, docker (via npipe) accepts native absolute paths with drive letters.
 * We therefore avoid path normalization that replaces separators.
 */
export function toBindSpec(
  hostPath: string,
  containerPath: string,
  readOnly: boolean | undefined,
): string {
  const absHost = path.isAbsolute(hostPath)
    ? hostPath
    : path.resolve(getRepoRoot(), hostPath);

  const mode = readOnly ? 'ro' : 'rw';
  return `${absHost}:${containerPath}:${mode}`;
}

/**
 * Very light sanity check for container names.
 * Docker allows [a-zA-Z0-9][a-zA-Z0-9_.-]+ typically; we ensure non-empty and no spaces.
 */
export function assertValidContainerName(name: string): void {
  if (!name || typeof name !== 'string') {
    throw new Error('Container name must be a non-empty string.');
  }
  if (/\s/.test(name)) {
    throw new Error('Container name must not contain whitespace.');
  }
}
