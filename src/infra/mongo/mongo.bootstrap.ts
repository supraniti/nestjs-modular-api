import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DockerService } from '../../modules/docker/docker.service';
import { DockerError } from '../../modules/docker/internal/docker.error';
import type {
  ContainerStateInfo,
  ContainerStatus,
} from '../../modules/docker/internal/docker.types';
import {
  loadMongoInfraConfig,
  toMongoRunOptions,
  buildMongoUri,
} from './mongo.config';
import { waitForTcpOpen } from '../../lib/net/tcp-wait';

/**
 * Core bootstrap that ensures a local MongoDB container is present, running, and TCP-ready.
 * Infra-only (no HTTP). Runs on every app start and is idempotent.
 */
@Injectable()
export class MongoInfraBootstrap implements OnApplicationBootstrap {
  private readonly logger = new Logger(MongoInfraBootstrap.name);

  public constructor(private readonly docker: DockerService) {}

  public async onApplicationBootstrap(): Promise<void> {
    const cfg = loadMongoInfraConfig();

    if (!cfg.autoStart) {
      this.logger.log('Mongo auto-start disabled. Skipping orchestration.');
      return;
    }

    this.logger.log(
      `Ensuring Mongo ${cfg.image} container "${cfg.containerName}" is up on ${cfg.host}:${cfg.port} ...`,
    );

    try {
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
        // DB is core infra; make the failure explicit.
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
    return `${uri.slice(0, schemeIdx + 3)}${maskedAuth}${afterScheme.slice(atIdx)}`;
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
        await this.docker.runContainer(desired);
        this.logger.log(`Mongo container "${containerName}" started.`);
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
          `Restart result: status="${res.status}"${res.id ? ` id=${res.id}` : ''}`,
        );

        // If restart didn't get us to running, we do a safe re-create:
        if (res.status !== 'running') {
          this.logger.warn(
            `Restart did not reach "running" (status="${res.status}"). Removing and re-creating container...`,
          );
          await this.docker.remove(containerName);
          await this.docker.runContainer(desired);
          this.logger.log(
            `Mongo container "${containerName}" re-created and started.`,
          );
        }
        return;
      }
    }
  }
}
