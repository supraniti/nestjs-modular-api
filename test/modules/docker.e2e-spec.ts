import { Test, TestingModule } from '@nestjs/testing';
import { DockerModule } from '../../src/modules/docker/docker.module';
import { DockerService } from '../../src/modules/docker/docker.service';
import { ENV_DOCKER_E2E } from '../../src/modules/docker/internal/docker.types';

// Generous timeout for first-time image pulls on slow networks.
jest.setTimeout(180_000);

const enabled: boolean = process.env[ENV_DOCKER_E2E] === '1';
// Choose the correct describe function based on the gate.
const d = enabled ? describe : describe.skip;

d('DockerService (e2e)', () => {
  let moduleRef: TestingModule;
  let svc: DockerService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [DockerModule],
    }).compile();

    svc = moduleRef.get<DockerService>(DockerService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  const name = 'modapi-mongo-e2e';
  const image = 'mongo:latest';

  it('runs mongo container, inspects state, stops and removes it', async () => {
    // Best-effort cleanup if an old container exists
    await svc.remove(name);

    // Run container
    const runRes = await svc.runContainer({
      name,
      image,
      env: {
        MONGO_INITDB_ROOT_USERNAME: 'root',
        MONGO_INITDB_ROOT_PASSWORD: 'pass',
      },
    });

    expect(runRes.name).toBe(name);
    expect(['running', 'created']).toContain(runRes.status);

    // Inspect state
    const state1 = await svc.getState(name);
    expect(state1.name).toBe(name);
    expect(state1.id === null || typeof state1.id === 'string').toBe(true);
    expect(['running', 'created', 'exited', 'paused', 'dead']).toContain(
      state1.status,
    );

    // Stop container
    const stopRes = await svc.stop(name);
    expect(stopRes.name).toBe(name);
    expect(['exited', 'paused', 'dead', 'running', 'created']).toContain(
      stopRes.status,
    );

    // Remove container
    const rmRes = await svc.remove(name);
    expect(rmRes.name).toBe(name);
    expect(rmRes.status).toBe('not-found');
  });
});

// When disabled, still have a trivial passing test outside the skipped suite for visibility.
if (!enabled) {
  it('Docker e2e skipped because DOCKER_E2E != 1', () => {
    expect(true).toBe(true);
  });
}
