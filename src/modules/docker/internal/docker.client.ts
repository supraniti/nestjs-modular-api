import Dockerode, { ContainerInspectInfo } from 'dockerode';
import type { Container } from 'dockerode';
import {
  ClientCreateOptions,
  ContainerStateInfo,
  ContainerStatus,
  DEFAULT_CREATE_TIMEOUT_MS,
  DEFAULT_INSPECT_TIMEOUT_MS,
  DEFAULT_PULL_TIMEOUT_MS,
  DEFAULT_REMOVE_TIMEOUT_MS,
  DEFAULT_RESTART_TIMEOUT_MS,
  DEFAULT_START_TIMEOUT_MS,
  DEFAULT_STOP_TIMEOUT_MS,
  DOCKER_LABEL_KEY,
  DOCKER_LABEL_VALUE,
  RunContainerOptions,
} from './docker.types';
import {
  envObjectToList,
  ensureContainerDataDir,
  toBindSpec,
  toPortBindings,
  assertValidContainerName,
} from './path.util';
import { DockerError, wrapDockerError } from './docker.error';

/** Promise timeout helper that rejects with a real Error. */
function withTimeout<T>(
  p: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(message)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e instanceof Error ? e : new Error(JSON.stringify(e)));
      },
    );
  });
}

/** Wait until a Docker stream ends or errors. */
function waitStreamEnd(
  stream: NodeJS.ReadableStream,
  timeoutMs: number,
  what: string,
): Promise<void> {
  return withTimeout(
    new Promise<void>((resolve, reject) => {
      const onEnd = () => {
        cleanup();
        resolve();
      };
      const onError = (err: unknown) => {
        cleanup();
        reject(err instanceof Error ? err : new Error(JSON.stringify(err)));
      };
      const cleanup = () => {
        stream.off('end', onEnd);
        stream.off('close', onEnd);
        stream.off('error', onError);
      };
      stream.on('end', onEnd);
      stream.on('close', onEnd);
      stream.on('error', onError);
    }),
    timeoutMs,
    `Timed out waiting for ${what} stream`,
  );
}

/**
 * Strictly typed dockerode wrapper with timeouts.
 */
export class DockerClient {
  private readonly docker: Dockerode;

  public constructor() {
    this.docker = this.createDockerConnection();
  }

  private createDockerConnection(): Dockerode {
    const isWin = process.platform === 'win32';
    const socketPath = isWin
      ? '//./pipe/docker_engine'
      : '/var/run/docker.sock';
    return new Dockerode({ socketPath });
  }

  /** Ensure docker daemon is reachable. */
  public async ping(): Promise<boolean> {
    try {
      await this.docker.ping();
      return true;
    } catch (err) {
      throw new DockerError(
        'DOCKER_UNAVAILABLE',
        'Docker daemon not reachable',
        {
          cause: err,
        },
      );
    }
  }

  /** Check if an image exists locally. */
  public async imageExists(image: string): Promise<boolean> {
    try {
      await this.docker.getImage(image).inspect();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Pull an image; completes when the pull stream finishes.
   * If the image is already available locally, this is a no-op.
   * If the pull fails but the image exists, treat as success.
   */
  public async pullImage(
    image: string,
    timeoutMs = DEFAULT_PULL_TIMEOUT_MS,
  ): Promise<void> {
    // No-op if already present
    if (await this.imageExists(image)) return;

    try {
      const stream: NodeJS.ReadableStream = await new Promise(
        (resolve, reject) => {
          // Mark the potential promise-returning call as intentionally ignored
          void this.docker.pull(
            image,
            (err?: unknown, s?: NodeJS.ReadableStream) => {
              if (err)
                return reject(
                  err instanceof Error ? err : new Error(JSON.stringify(err)),
                );
              if (!s) return reject(new Error('No pull stream returned.'));
              resolve(s);
            },
          );
        },
      );

      await waitStreamEnd(stream, timeoutMs, `pull image ${image}`);

      // Verify presence after pull
      await this.docker.getImage(image).inspect();
    } catch (err) {
      // If pull failed but the image is actually present, consider it success.
      if (await this.imageExists(image)) return;
      throw wrapDockerError(
        'PULL_FAILED',
        `Failed to pull image ${image}`,
        { image },
        err,
      );
    }
  }

  /** Create (but not start) a container. */
  public async createContainer(
    opts: RunContainerOptions,
    timeoutMs = DEFAULT_CREATE_TIMEOUT_MS,
  ): Promise<void> {
    assertValidContainerName(opts.name);

    try {
      const binds: string[] = [];

      // Auto persistent data dir under /data
      const persistentDir = ensureContainerDataDir(opts.name);
      binds.push(toBindSpec(persistentDir, '/data', false));

      // User-specified mounts
      if (opts.volumes && opts.volumes.length > 0) {
        for (const vol of opts.volumes) {
          binds.push(toBindSpec(vol.hostPath, vol.containerPath, vol.readOnly));
        }
      }

      const create: ClientCreateOptions = {
        name: opts.name,
        image: opts.image,
        env: envObjectToList(opts.env),
        binds,
        portBindings: toPortBindings(opts.ports),
        labels: { [DOCKER_LABEL_KEY]: DOCKER_LABEL_VALUE },
        restartPolicy: opts.restartPolicy ?? 'no',
        args: opts.args ?? [],
      };

      const createPromise: Promise<Container> = this.docker.createContainer({
        name: create.name,
        Image: create.image,
        Env: create.env,
        HostConfig: {
          Binds: create.binds,
          PortBindings: create.portBindings,
          RestartPolicy: { Name: create.restartPolicy },
        },
        Labels: create.labels,
        Cmd: create.args,
      });

      await withTimeout(
        createPromise,
        timeoutMs,
        `Timed out creating container ${opts.name}`,
      );
      return;
    } catch (err) {
      throw wrapDockerError(
        'CREATE_FAILED',
        `Failed to create container ${opts.name}`,
        { image: opts.image },
        err,
      );
    }
  }

  /** Start an existing container by name. */
  public async startContainer(
    name: string,
    timeoutMs = DEFAULT_START_TIMEOUT_MS,
  ): Promise<void> {
    assertValidContainerName(name);
    const container = this.docker.getContainer(name);
    try {
      await withTimeout(
        container.start() as unknown as Promise<void>,
        timeoutMs,
        `Timed out starting container ${name}`,
      );
    } catch (err) {
      throw wrapDockerError(
        'START_FAILED',
        `Failed to start container ${name}`,
        { containerName: name },
        err,
      );
    }
  }

  /** Stop a running container. */
  public async stopContainer(
    name: string,
    timeoutMs = DEFAULT_STOP_TIMEOUT_MS,
  ): Promise<void> {
    assertValidContainerName(name);
    const container = this.docker.getContainer(name);
    try {
      await withTimeout(
        container.stop() as unknown as Promise<void>,
        timeoutMs,
        `Timed out stopping container ${name}`,
      );
    } catch (err) {
      throw wrapDockerError(
        'STOP_FAILED',
        `Failed to stop container ${name}`,
        { containerName: name },
        err,
      );
    }
  }

  /** Restart a running container. */
  public async restartContainer(
    name: string,
    timeoutMs = DEFAULT_RESTART_TIMEOUT_MS,
  ): Promise<void> {
    assertValidContainerName(name);
    const container = this.docker.getContainer(name);
    try {
      await withTimeout(
        container.restart() as unknown as Promise<void>,
        timeoutMs,
        `Timed out restarting container ${name}`,
      );
    } catch (err) {
      throw wrapDockerError(
        'RESTART_FAILED',
        `Failed to restart container ${name}`,
        { containerName: name },
        err,
      );
    }
  }

  /** Remove a container (forcefully). */
  public async removeContainer(
    name: string,
    timeoutMs = DEFAULT_REMOVE_TIMEOUT_MS,
  ): Promise<void> {
    assertValidContainerName(name);
    const container = this.docker.getContainer(name);
    try {
      await withTimeout(
        container.remove({ force: true }) as unknown as Promise<void>,
        timeoutMs,
        `Timed out removing container ${name}`,
      );
    } catch (err) {
      throw wrapDockerError(
        'REMOVE_FAILED',
        `Failed to remove container ${name}`,
        { containerName: name },
        err,
      );
    }
  }

  /** Inspect container and normalize info. */
  public async inspectContainer(
    name: string,
    timeoutMs = DEFAULT_INSPECT_TIMEOUT_MS,
  ): Promise<ContainerStateInfo> {
    assertValidContainerName(name);

    try {
      const data: ContainerInspectInfo = await withTimeout(
        this.docker.getContainer(name).inspect(),
        timeoutMs,
        `Timed out inspecting container ${name}`,
      );

      const rawStatus = data.State?.Status ?? 'not-found';
      const known: ReadonlyArray<ContainerStatus> = [
        'created',
        'running',
        'exited',
        'paused',
        'dead',
        'removing',
        'not-found',
      ];
      const status: ContainerStatus = known.includes(
        rawStatus as ContainerStatus,
      )
        ? (rawStatus as ContainerStatus)
        : 'not-found';

      const ports = Object.entries(data.NetworkSettings?.Ports ?? {}).map(
        ([key, bindings]) => {
          const [containerPortStr, proto] = key.split('/');
          const containerPort = parseInt(containerPortStr, 10);
          const first = Array.isArray(bindings) ? bindings[0] : undefined;
          const host =
            first && typeof first.HostPort === 'string'
              ? Number(first.HostPort)
              : undefined;
          return {
            container: containerPort,
            host,
            protocol: (proto ?? 'tcp') as 'tcp' | 'udp',
          };
        },
      );

      const startedAt =
        typeof data.State?.StartedAt === 'string' ? data.State.StartedAt : null;
      const finishedAt =
        typeof data.State?.FinishedAt === 'string'
          ? data.State.FinishedAt
          : null;
      const exitCode =
        typeof data.State?.ExitCode === 'number' ? data.State.ExitCode : null;

      const labels =
        (data.Config?.Labels as Record<string, string> | undefined) ?? {};

      return {
        name:
          typeof data.Name === 'string' ? data.Name.replace(/^\//, '') : name,
        id: typeof data.Id === 'string' ? data.Id : null,
        status,
        startedAt,
        finishedAt,
        exitCode,
        ports,
        labels,
      };
    } catch (err) {
      throw wrapDockerError(
        'INSPECT_FAILED',
        `Failed to inspect container ${name}`,
        { containerName: name },
        err,
      );
    }
  }
}
