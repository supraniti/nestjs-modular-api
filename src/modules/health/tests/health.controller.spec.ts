import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from '../health.controller';
import { HealthService } from '../health.service';
import { PingResponseDto } from '../dto/Ping.response.dto';
import { InfoResponseDto } from '../dto/Info.response.dto';

describe('HealthController', () => {
  let moduleRef: TestingModule;
  let controller: HealthController;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [HealthService],
    }).compile();

    controller = moduleRef.get<HealthController>(HealthController);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('ping() returns PingResponseDto with ok=true', () => {
    const result: PingResponseDto = controller.ping();

    expect(result).toBeInstanceOf(PingResponseDto);
    expect(result.ok).toBe(true);
    expect(typeof result.timestamp).toBe('string');
    expect(typeof result.epochMs).toBe('number');
    expect(typeof result.uptimeSec).toBe('number');
  });

  it('info() returns InfoResponseDto with status=ok', () => {
    const result: InfoResponseDto = controller.info();

    expect(result).toBeInstanceOf(InfoResponseDto);
    expect(result.status).toBe('ok');
    expect(typeof result.timestamp).toBe('string');
    expect(typeof result.uptimeSec).toBe('number');
    expect(typeof result.pid).toBe('number');
    expect(typeof result.node).toBe('string');
    expect(typeof result.env).toBe('string');
    expect(result.version === null || typeof result.version === 'string').toBe(
      true,
    );
  });
});
