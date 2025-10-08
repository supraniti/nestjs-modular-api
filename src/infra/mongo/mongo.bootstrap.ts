import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DockerService } from '../../modules/docker/docker.service';
import { DockerError } from '../../modules/docker/internal/docker.error';
import type { ContainerStateInfo, ContainerStatus } from '@lib/docker';
import {
  loadMongoInfraConfig,
  toMongoRunOptions,
  buildMongoUri,
} from './mongo.config';
import { waitForTcpOpen } from '../../lib/net/tcp-wait';
import Docker from 'dockerode';

/** Treat common “true” strings as true. */
function isTruthyEnv(value: string | undefined): boolean {
  if (value === undefined) return false;
  const v = value.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/** CI detection (GitHub Actions, etc.). */
function isCiEnvironment(env: NodeJS.ProcessEnv = process.env): boolean {
  return isTruthyEnv(env.CI) || isTruthyEnv(env.GITHUB_ACTIONS);
}

/** Jest/test detection (unit or e2e). */
function isTestEnvironment(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    isTruthyEnv(env.JEST_WORKER_ID) ||
    (env.NODE_ENV ?? '').toLowerCase() === 'test'
  );
}

/** Should we skip orchestration right now? */
function shouldSkipOrchestration(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (isCiEnvironment(env)) return true; // never orchestrate in CI
  const inTests = isTestEnvironment(env);
  const explicitEnable =
    isTruthyEnv(env.DOCKER_E2E) || isTruthyEnv(env.MONGO_AUTO_START);
  // During tests, only run if explicitly enabled
  if (inTests && !explicitEnable) return true;
  return false;
}

/**
 * Core bootstrap that ensures a local MongoDB container is present, running, and TCP-ready.
 * Infra-only (no HTTP). Runs on every app start and is idempotent.
 * Auto-disabled in CI; auto-disabled in Jest tests unless explicitly enabled (DOCKER_E2E=1 or MONGO_AUTO_START=1).
 */
@Injectable()
export class MongoInfraBootstrap implements OnApplicationBootstrap {
  private readonly logger = new Logger(MongoInfraBootstrap.name);

  public constructor(private readonly docker: DockerService) {}

  public async onApplicationBootstrap(): Promise<void> {
    const cfg = loadMongoInfraConfig();
    const env = process.env;

    // Global gates
    if (shouldSkipOrchestration(env)) {
      this.logger.log(
        'Test/CI environment detected; skipping Mongo orchestration.',
      );
      return;
    }

    // Explicit opt-out
    if (!cfg.autoStart) {
      this.logger.log('Mongo auto-start disabled. Skipping orchestration.');
      return;
    }

    this.logger.log(
      `Ensuring Mongo ${cfg.image} container "${cfg.containerName}" is up on ${cfg.host}:${cfg.port} ...`,
    );

    try {
      // Ensure the image exists locally (pull if missing)
      await this.ensureImageAvailable(cfg.image);

      // Ensure container exists and is running
      await this.ensureContainerRunning(cfg.containerName, cfg.image);

      // TCP readiness (accepting connections)
      await waitForTcpOpen({
        host: cfg.host,
        port: cfg.port,
        timeoutMs: cfg.readinessTimeoutMs,
        intervalMs: cfg.readinessProbeIntervalMs,
      });

      const uri = buildMongoUri(cfg);
      this.logger.log(`Mongo is ready. URI: ${this.maskMongoUri(uri)}`);
    } catch (err) {
      if (err instanceof DockerError && err.code === 'DOCKER_UNAVAILABLE') {
        this.logger.error(
          'Docker daemon unavailable; Mongo infra cannot start.',
        );
      }
      throw err;
    }
  }

  private maskMongoUri(uri: string): string {
    // mongodb://user:pass@host:port/... -> mongodb://user:****@host:port/...
    const schemeIdx = uri.indexOf('://');
    if (schemeIdx === -1) return uri;
    const afterScheme = uri.slice(schemeIdx + 3);
    const atIdx = afterScheme.indexOf('@');
    if (atIdx === -1) return uri;
    const auth = afterScheme.slice(0, atIdx);
    const colonIdx = auth.indexOf(':');
    if (colonIdx === -1) return uri;
    const maskedAuth = `${auth.slice(0, colonIdx)}:****`;
    return `${uri.slice(0, schemeIdx + 3)}${maskedAuth}${afterScheme.slice(
      atIdx,
    )}`;
  }

  private async ensureContainerRunning(
    containerName: string,
    image: string,
  ): Promise<void> {
    const cfg = loadMongoInfraConfig();
    const desired = toMongoRunOptions(cfg);

    // Discover current state
    let state: ContainerStateInfo | null = null;
    try {
      state = await this.docker.getState(containerName);
    } catch (err) {
      if (err instanceof DockerError && err.code === 'INSPECT_FAILED') {
        state = null; // treat as not found
      } else {
        throw err; // surface unknown inspection errors
      }
    }

    const status: ContainerStatus | 'not-found' = state?.status ?? 'not-found';

    switch (status) {
      case 'running': {
        this.logger.log(
          `Mongo container "${containerName}" already running (id=${state?.id ?? 'n/a'}).`,
        );
        return;
      }

      case 'not-found': {
        this.logger.log(
          `Mongo container "${containerName}" not found. Creating and starting (${image})...`,
        );

        try {
          await this.docker.runContainer(desired);
          this.logger.log(`Mongo container "${containerName}" started.`);
        } catch (err) {
          if (err instanceof DockerError) {
            this.logger.warn(
              `Create failed for "${containerName}" (${err.code ?? 'UNKNOWN'}). Re-inspecting...`,
            );

            const recheck = await this.docker
              .getState(containerName)
              .catch(() => null);

            // If we still can't inspect, surface the original error
            if (!recheck) {
              throw err;
            }

            // If it’s running now, it was just a race — continue
            if (recheck.status === 'running') {
              this.logger.log(
                `Container "${containerName}" appeared after race; continuing (id=${recheck.id}).`,
              );
              return;
            }

            // Otherwise it exists but isn’t running — try restart then recreate
            this.logger.warn(
              `Container "${containerName}" exists but is "${recheck.status}". Attempting restart...`,
            );
            const restarted = await this.docker.restart(containerName);
            if (restarted.status === 'running') return;

            this.logger.warn(
              `Restart did not reach running (status="${restarted.status}"). Removing & re-creating...`,
            );
            await this.docker.remove(containerName);
            await this.docker.runContainer(desired);
            this.logger.log(
              `Mongo container "${containerName}" re-created and started.`,
            );
            return;
          }
          // Not a DockerError — bubble up
          throw err;
        }

        return;
      }

      // Handle any non-running states by trying a restart first.
      case 'created':
      case 'exited':
      case 'paused':
      case 'dead':
      case 'removing': {
        this.logger.warn(
          `Mongo container "${containerName}" present with status "${status}". Attempting restart...`,
        );
        const res = await this.docker.restart(containerName);
        this.logger.log(
          `Restart result: status="${res.status}"${
            res.id ? ` id=${res.id}` : ''
          }`,
        );

        // If restart didn't get us to running, we do a safe re-create:
        if (res.status !== 'running') {
          this.logger.warn(
            `Restart did not reach "running" (status="${res.status}"). Removing and re-creating container...`,
          );
          await this.docker.remove(containerName);
          await this.ensureImageAvailable(image);
          await this.docker.runContainer(desired);
          this.logger.log(
            `Mongo container "${containerName}" re-created and started.`,
          );
        }
        return;
      }
    }
  }

  /**
   * Ensure the Docker image exists locally. If missing and auto-pull is enabled,
   * pull it once. (On CI we skip all orchestration via shouldSkipOrchestration.)
   *
   * Env:
   * - MONGO_IMAGE_AUTO_PULL (default: "1"): set "0" to skip automatic pulls.
   */
  private async ensureImageAvailable(image: string): Promise<void> {
    const autoPull =
      process.env.MONGO_IMAGE_AUTO_PULL === undefined
        ? true
        : isTruthyEnv(process.env.MONGO_IMAGE_AUTO_PULL);

    const docker = new Docker();

    const exists = await this.imageExists(docker, image);
    if (exists) return;

    if (!autoPull) {
      this.logger.warn(
        `Docker image "${image}" not found locally and MONGO_IMAGE_AUTO_PULL=0; skipping pull.`,
      );
      return;
    }

    this.logger.log(`Pulling Docker image "${image}" ...`);
    await this.pullImage(docker, image);
    this.logger.log(`Image "${image}" pulled.`);
  }

  private async imageExists(docker: Docker, image: string): Promise<boolean> {
    try {
      await docker.getImage(image).inspect();
      return true;
    } catch {
      return false;
    }
  }

  private async pullImage(docker: Docker, image: string): Promise<void> {
    const stream = await docker.pull(image);
    await new Promise<void>((resolve, reject) => {
      stream.on('end', resolve);
      stream.on('error', reject);
      stream.resume(); // drain
    });
  }
}
