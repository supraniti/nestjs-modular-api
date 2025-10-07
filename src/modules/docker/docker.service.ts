import { Injectable } from '@nestjs/common';
import type {
  ActionResult,
  ContainerStateInfo,
  RunContainerOptions,
  RunContainerResult,
} from '@lib/docker';
import {
  DEFAULT_CREATE_TIMEOUT_MS,
  DEFAULT_RESTART_TIMEOUT_MS,
  DEFAULT_START_TIMEOUT_MS,
  DEFAULT_STOP_TIMEOUT_MS,
  DEFAULT_INSPECT_TIMEOUT_MS,
} from '@lib/docker';
import { DockerClient } from './internal/docker.client';
import { DockerError } from './internal/docker.error';

/**
 * Internal Docker service (no HTTP controllers).
 * Exposes high-level operations for other modules.
 *
 * Conventions enforced:
 * - Containers are addressed STRICTLY by name.
 * - A persistent host folder is mounted automatically at /data in the container
 *   under <repo-root>/ApplicationData/containers/<name>/ (created if missing).
 * - All containers get a safety label for filtering (set in DockerClient).
 * - E2E that uses this service MUST be gated by DOCKER_E2E=1.
 */
@Injectable()
export class DockerService {
  public constructor(private readonly client: DockerClient) {}

  /**
   * Run a container from an image (generic, not image-specific).
   * Behavior:
   *  - Try to create+start the container.
   *  - If creation fails due to missing image, pull then retry once.
   *  - Returns id (from inspect) and final status ('running' if start succeeded, else 'created').
   */
  public async runContainer(
    options: RunContainerOptions,
  ): Promise<RunContainerResult> {
    // Ensure engine is reachable early (clearer error than cascading failures).
    await this.client.ping();

    const tryCreate = async (): Promise<void> => {
      await this.client.createContainer(options, DEFAULT_CREATE_TIMEOUT_MS);
    };

    try {
      await tryCreate();
    } catch (err) {
      // If image missing or other create error, attempt a pull then retry once.
      if (err instanceof DockerError && err.code === 'CREATE_FAILED') {
        await this.client.pullImage(options.image);
        await tryCreate();
      } else {
        throw err;
      }
    }

    // Try to start; if start fails, still return with status 'created'.
    try {
      await this.client.startContainer(options.name, DEFAULT_START_TIMEOUT_MS);
      // Started successfully; inspect to obtain id & status
      const st = await this.client.inspectContainer(
        options.name,
        DEFAULT_INSPECT_TIMEOUT_MS,
      );
      return {
        name: options.name,
        id: st.id ?? '',
        status: 'running',
        warnings: [],
      };
    } catch (err) {
      // Start failed; inspect may still yield an id
      let id = '';
      try {
        const st = await this.client.inspectContainer(
          options.name,
          DEFAULT_INSPECT_TIMEOUT_MS,
        );
        id = st.id ?? '';
      } catch {
        // ignore secondary failure
      }
      const message =
        err instanceof Error ? err.message : 'Failed to start container';
      return {
        name: options.name,
        id,
        status: 'created',
        warnings: [message],
      };
    }
  }

  /** Get normalized state for a named container. */
  public async getState(name: string): Promise<ContainerStateInfo> {
    return this.client.inspectContainer(name, DEFAULT_INSPECT_TIMEOUT_MS);
  }

  /** Stop a running container by name. */
  public async stop(name: string): Promise<ActionResult> {
    try {
      await this.client.stopContainer(name, DEFAULT_STOP_TIMEOUT_MS);
      const st = await this.client.inspectContainer(
        name,
        DEFAULT_INSPECT_TIMEOUT_MS,
      );
      return { name, id: st.id, status: st.status, message: 'stopped' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'stop failed';
      return { name, id: null, status: 'exited', message: msg };
    }
  }

  /** Restart a running container by name. */
  public async restart(name: string): Promise<ActionResult> {
    try {
      await this.client.restartContainer(name, DEFAULT_RESTART_TIMEOUT_MS);
      const st = await this.client.inspectContainer(
        name,
        DEFAULT_INSPECT_TIMEOUT_MS,
      );
      return { name, id: st.id, status: st.status, message: 'restarted' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'restart failed';
      return { name, id: null, status: 'exited', message: msg };
    }
  }

  /** Remove a container by name (force). */
  public async remove(name: string): Promise<ActionResult> {
    try {
      await this.client.removeContainer(name);
      return { name, id: null, status: 'not-found', message: 'removed' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'remove failed';
      return { name, id: null, status: 'not-found', message: msg };
    }
  }
}
