import { Test, TestingModule } from '@nestjs/testing';
import { MongoInfraBootstrap } from '../mongo.bootstrap';
import { DockerService } from '../../../modules/docker/docker.service';
import type {
  ActionResult,
  ContainerStateInfo,
  RunContainerOptions,
  RunContainerResult,
} from '@lib/docker';
import { DockerError } from '../../../modules/docker/internal/docker.error';
import * as TcpWait from '../../../lib/net/tcp-wait';

type AnyFn = (...args: any[]) => any;
type Mocked<T extends AnyFn> = jest.Mock<ReturnType<T>, Parameters<T>>;

interface DockerServiceMocks {
  getState: Mocked<DockerService['getState']>;
  runContainer: Mocked<DockerService['runContainer']>;
  restart: Mocked<DockerService['restart']>;
  remove: Mocked<DockerService['remove']>;
}

describe('MongoInfraBootstrap', () => {
  let moduleRef: TestingModule;
  let bootstrap: MongoInfraBootstrap;
  let docker: DockerServiceMocks;
  let waitSpy: jest.MockedFunction<typeof TcpWait.waitForTcpOpen>;

  // Save/restore CI-related env so we can override inside tests
  const savedEnv = {
    CI: process.env.CI,
    GITHUB_ACTIONS: process.env.GITHUB_ACTIONS,
    NODE_ENV: process.env.NODE_ENV,
    MONGO_AUTO_START: process.env.MONGO_AUTO_START,
  };

  const runningState: ContainerStateInfo = {
    name: 'app-mongo',
    id: 'abc123',
    status: 'running',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    exitCode: null,
    ports: [{ host: 27017, container: 27017, protocol: 'tcp' }],
    labels: { 'com.modular-api.managed': 'true' },
  };

  beforeEach(async () => {
    // --- Gate overrides for tests ---
    // Ensure bootstrap does NOT think we're in CI:
    process.env.CI = '0';
    process.env.GITHUB_ACTIONS = '0';
    // Explicitly opt-in to orchestration during unit tests (bootstrap skips by default in Jest)
    process.env.MONGO_AUTO_START = '1';
    // Keep NODE_ENV as 'test' (typical in Jest)
    process.env.NODE_ENV = 'test';

    // Typed spy for the TCP wait helper
    waitSpy = jest.spyOn(TcpWait, 'waitForTcpOpen') as jest.MockedFunction<
      typeof TcpWait.waitForTcpOpen
    >;
    waitSpy.mockResolvedValue(undefined);

    docker = {
      getState: jest
        .fn<
          ReturnType<DockerService['getState']>,
          Parameters<DockerService['getState']>
        >()
        .mockResolvedValue(runningState),
      runContainer: jest
        .fn<
          ReturnType<DockerService['runContainer']>,
          Parameters<DockerService['runContainer']>
        >()
        .mockResolvedValue({
          name: 'app-mongo',
          id: 'abc123',
          status: 'running',
          warnings: [],
        } as RunContainerResult),
      restart: jest
        .fn<
          ReturnType<DockerService['restart']>,
          Parameters<DockerService['restart']>
        >()
        .mockResolvedValue({
          name: 'app-mongo',
          id: 'abc123',
          status: 'running',
          message: 'restarted',
        } as ActionResult),
      remove: jest
        .fn<
          ReturnType<DockerService['remove']>,
          Parameters<DockerService['remove']>
        >()
        .mockResolvedValue({
          name: 'app-mongo',
          id: null,
          status: 'not-found',
          message: 'removed',
        } as ActionResult),
    };

    moduleRef = await Test.createTestingModule({
      providers: [
        MongoInfraBootstrap,
        { provide: DockerService, useValue: docker },
      ],
    }).compile();

    bootstrap = moduleRef.get(MongoInfraBootstrap);
  });

  afterEach(async () => {
    await moduleRef.close();
    jest.restoreAllMocks();

    // Restore original env
    if (savedEnv.CI === undefined) delete process.env.CI;
    else process.env.CI = savedEnv.CI;

    if (savedEnv.GITHUB_ACTIONS === undefined)
      delete process.env.GITHUB_ACTIONS;
    else process.env.GITHUB_ACTIONS = savedEnv.GITHUB_ACTIONS;

    if (savedEnv.NODE_ENV === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = savedEnv.NODE_ENV;

    if (savedEnv.MONGO_AUTO_START === undefined)
      delete process.env.MONGO_AUTO_START;
    else process.env.MONGO_AUTO_START = savedEnv.MONGO_AUTO_START;
  });

  it('skips orchestration when MONGO_AUTO_START=0', async () => {
    process.env.MONGO_AUTO_START = '0';

    await bootstrap.onApplicationBootstrap();

    expect(docker.getState).not.toHaveBeenCalled();
    expect(docker.runContainer).not.toHaveBeenCalled();
    expect(docker.restart).not.toHaveBeenCalled();
    expect(docker.remove).not.toHaveBeenCalled();
    expect(waitSpy).not.toHaveBeenCalled();
  });

  it('does nothing when container is already running', async () => {
    await bootstrap.onApplicationBootstrap();

    expect(docker.getState).toHaveBeenCalledWith('app-mongo');
    expect(docker.runContainer).not.toHaveBeenCalled();
    expect(docker.restart).not.toHaveBeenCalled();
    expect(docker.remove).not.toHaveBeenCalled();

    expect(waitSpy).toHaveBeenCalledTimes(1);
    const args = waitSpy.mock.calls[0]?.[0];
    expect(args).toBeDefined();
    expect(args?.host).toBe('127.0.0.1');
    expect(args?.port).toBe(27017);
  });

  it('creates and starts when container is not found (inspect failure)', async () => {
    docker.getState.mockRejectedValueOnce(
      new DockerError('INSPECT_FAILED', 'not found'),
    );

    await bootstrap.onApplicationBootstrap();

    expect(docker.runContainer).toHaveBeenCalledTimes(1);
    const runArg: RunContainerOptions = docker.runContainer.mock.calls[0][0];
    expect(runArg.name).toBe('app-mongo');
    expect(runArg.image).toBe('mongo:7');
    expect(waitSpy).toHaveBeenCalledTimes(1);
  });

  it('restarts when container exists but is exited', async () => {
    docker.getState.mockResolvedValueOnce({
      ...runningState,
      status: 'exited',
    });

    await bootstrap.onApplicationBootstrap();

    expect(docker.restart).toHaveBeenCalledWith('app-mongo');
    expect(docker.remove).not.toHaveBeenCalled();
    expect(waitSpy).toHaveBeenCalledTimes(1);
  });

  it('removes and recreates when restart does not reach running', async () => {
    docker.getState.mockResolvedValueOnce({
      ...runningState,
      status: 'exited',
    });
    docker.restart.mockResolvedValueOnce({
      name: 'app-mongo',
      id: 'abc123',
      status: 'exited',
      message: 'still exited',
    });

    await bootstrap.onApplicationBootstrap();

    expect(docker.restart).toHaveBeenCalledWith('app-mongo');
    expect(docker.remove).toHaveBeenCalledWith('app-mongo');
    expect(docker.runContainer).toHaveBeenCalledTimes(1);
    expect(waitSpy).toHaveBeenCalledTimes(1);
  });
});
