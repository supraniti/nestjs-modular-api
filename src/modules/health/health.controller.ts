import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';
import { PingResponseDto } from './dto/Ping.response.dto';
import { InfoResponseDto } from './dto/Info.response.dto';

@Controller('api/health')
export class HealthController {
  public constructor(private readonly healthService: HealthService) {}

  @Get('ping')
  public ping(): PingResponseDto {
    const r = this.healthService.ping();
    return new PingResponseDto({
      timestamp: r.timestamp,
      epochMs: r.epochMs,
      uptimeSec: r.uptimeSec,
    });
  }

  @Get('info')
  public info(): InfoResponseDto {
    const r = this.healthService.info();
    return new InfoResponseDto({
      timestamp: r.timestamp,
      uptimeSec: r.uptimeSec,
      pid: r.pid,
      node: r.node,
      env: r.env,
      version: r.version,
    });
  }
}
