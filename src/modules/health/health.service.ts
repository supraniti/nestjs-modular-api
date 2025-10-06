import { Injectable } from '@nestjs/common';

export interface PingResult {
  ok: true;
  timestamp: string; // ISO-8601 timestamp
  epochMs: number;
  uptimeSec: number;
}

export interface InfoResult {
  status: 'ok';
  timestamp: string; // ISO-8601 timestamp
  uptimeSec: number;
  pid: number;
  node: string;
  env: string;
  version: string | null;
}

@Injectable()
export class HealthService {
  public ping(): PingResult {
    const now = new Date();
    return {
      ok: true,
      timestamp: now.toISOString(),
      epochMs: now.getTime(),
      uptimeSec: Math.floor(process.uptime()),
    };
  }

  public info(): InfoResult {
    const now = new Date();
    const version =
      (process.env.APP_VERSION && String(process.env.APP_VERSION)) || null;

    return {
      status: 'ok',
      timestamp: now.toISOString(),
      uptimeSec: Math.floor(process.uptime()),
      pid: process.pid,
      node: process.version,
      env: process.env.NODE_ENV ? String(process.env.NODE_ENV) : 'development',
      version,
    };
  }
}
