import { Test, TestingModule } from '@nestjs/testing';
import { DockerService } from '../docker.service';
import { DockerClient } from '../internal/docker.client';
import type {
  ActionResult,
  ContainerStateInfo,
  RunContainerOptions,
  RunContainerResult,
} from '@lib/docker';
import { DockerError } from '../internal/docker.error';

type Mock<T> = jest.Mock<T extends Promise<unknown> ? T : never, any[]>;

interface DockerClientTypedMocks {
  ping: Mock<ReturnType<DockerClient['ping']>>;
  pullImage: Mock<ReturnType<DockerClient['pullImage']>>;
  createContainer: Mock<ReturnType<DockerClient['createContainer']>>;
  startContainer: Mock<ReturnType<DockerClient['startContainer']>>;
  stopContainer: Mock<ReturnType<DockerClient['stopContainer']>>;
  restartContainer: Mock<ReturnType<DockerClient['restartContainer']>>;
  removeContainer: Mock<ReturnType<DockerClient['removeContainer']>>;
  inspectContainer: Mock<ReturnType<DockerClient['inspectContainer']>>;
}

describe('DockerService', () => {
  let moduleRef: TestingModule;
  let service: DockerService;
  let client: DockerClientTypedMocks;

  const baseState: ContainerStateInfo = {
    name: 'modapi-mongo-e2e',
    id: 'abc123',
    status: 'running',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    exitCode: null,
    ports: [{ container: 27017, host: 27017, protocol: 'tcp' }],
    labels: { 'com.modular-api.managed': 'true' },
  };

  beforeEach(async () => {
    client = {
      ping: jest
        .fn<ReturnType<DockerClient['ping']>, []>()
        .mockResolvedValue(Promise.resolve(true)),
      pullImage: jest
        .fn<ReturnType<DockerClient['pullImage']>, [string]>()
        .mockResolvedValue(Promise.resolve()),
      createContainer: jest
        .fn<
          ReturnType<DockerClient['createContainer']>,
          [RunContainerOptions, number]
        >()
        .mockResolvedValue(Promise.resolve()),
      startContainer: jest
        .fn<ReturnType<DockerClient['startContainer']>, [string, number]>()
        .mockResolvedValue(Promise.resolve()),
      stopContainer: jest
        .fn<ReturnType<DockerClient['stopContainer']>, [string, number]>()
        .mockResolvedValue(Promise.resolve()),
      restartContainer: jest
        .fn<ReturnType<DockerClient['restartContainer']>, [string, number]>()
        .mockResolvedValue(Promise.resolve()),
      removeContainer: jest
        .fn<ReturnType<DockerClient['removeContainer']>, [string, number?]>()
        .mockResolvedValue(Promise.resolve()),
      inspectContainer: jest
        .fn<ReturnType<DockerClient['inspectContainer']>, [string, number?]>()
        .mockResolvedValue(Promise.resolve(baseState)),
    };

    moduleRef = await Test.createTestingModule({
      providers: [DockerService, { provide: DockerClient, useValue: client }],
    }).compile();

    service = moduleRef.get<DockerService>(DockerService);
  });

  afterEach(async () => {
    await moduleRef.close();
    jest.restoreAllMocks();
  });

  it('runContainer(): creates and starts container (happy path)', async () => {
    const opts: RunContainerOptions = {
      name: 'modapi-mongo-e2e',
      image: 'mongo:7',
      ports: [{ host: 27017, container: 27017 }],
      env: {
        MONGO_INITDB_ROOT_USERNAME: 'root',
        MONGO_INITDB_ROOT_PASSWORD: 'pass',
      },
    };

    const result: RunContainerResult = await service.runContainer(opts);

    expect(client.ping).toHaveBeenCalledTimes(1);
    expect(client.createContainer).toHaveBeenCalledTimes(1);
    expect(client.createContainer).toHaveBeenCalledWith(
      expect.objectContaining({ name: opts.name, image: opts.image }),
      expect.any(Number),
    );
    expect(client.startContainer).toHaveBeenCalledWith(
      opts.name,
      expect.any(Number),
    );
    expect(client.inspectContainer).toHaveBeenCalledWith(
      opts.name,
      expect.any(Number),
    );

    expect(result.name).toBe(opts.name);
    expect(result.id).toBe('abc123');
    expect(result.status).toBe('running');
    expect(result.warnings).toEqual([]);
  });

  it('runContainer(): pulls image and retries when create fails with CREATE_FAILED', async () => {
    const opts: RunContainerOptions = {
      name: 'modapi-mongo-e2e',
      image: 'mongo:7',
    };

    client.createContainer
      .mockRejectedValueOnce(new DockerError('CREATE_FAILED', 'no image'))
      .mockResolvedValueOnce(Promise.resolve());

    const result = await service.runContainer(opts);

    expect(client.pullImage).toHaveBeenCalledTimes(1);
    expect(client.pullImage).toHaveBeenCalledWith('mongo:7');
    expect(client.createContainer).toHaveBeenCalledTimes(2);
    expect(client.inspectContainer).toHaveBeenCalledWith(
      opts.name,
      expect.any(Number),
    );
    expect(result.id).toBe('abc123');
    expect(result.status).toBe('running');
  });

  it('getState(): returns normalized container info', async () => {
    const state = await service.getState('modapi-mongo-e2e');
    expect(client.inspectContainer).toHaveBeenCalledWith(
      'modapi-mongo-e2e',
      expect.any(Number),
    );
    expect(state.status).toBe('running');
    expect(state.id).toBe('abc123');
  });

  it('stop(): returns ActionResult with current status', async () => {
    client.inspectContainer.mockResolvedValueOnce(
      Promise.resolve({ ...baseState, status: 'exited' }),
    );

    const res: ActionResult = await service.stop('modapi-mongo-e2e');
    expect(client.stopContainer).toHaveBeenCalledWith(
      'modapi-mongo-e2e',
      expect.any(Number),
    );
    expect(res.status).toBe('exited');
    expect(res.message).toBe('stopped');
  });

  it('restart(): returns ActionResult with current status', async () => {
    client.inspectContainer.mockResolvedValueOnce(Promise.resolve(baseState));

    const res = await service.restart('modapi-mongo-e2e');
    expect(client.restartContainer).toHaveBeenCalledWith(
      'modapi-mongo-e2e',
      expect.any(Number),
    );
    expect(res.status).toBe('running');
    expect(res.message).toBe('restarted');
  });

  it('remove(): returns not-found after removal', async () => {
    const res = await service.remove('modapi-mongo-e2e');
    // Called with a single argument; no explicit undefined is passed.
    expect(client.removeContainer).toHaveBeenCalledWith('modapi-mongo-e2e');
    expect(res.status).toBe('not-found');
    expect(res.message).toBe('removed');
  });
});
