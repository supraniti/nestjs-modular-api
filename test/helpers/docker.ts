// test/helpers/docker.ts
export const dockerEnabled = process.env.DOCKER_E2E === '1';

export const describeIfDocker = dockerEnabled ? describe : describe.skip;
export const itIfDocker = dockerEnabled ? it : it.skip;
export const testIfDocker = itIfDocker;
