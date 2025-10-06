// Response DTO for GET /api/health/ping
// Keep DTOs side-effect free and strictly typed.

export class PingResponseDto {
  public readonly ok: true;
  public readonly timestamp: string; // ISO-8601
  public readonly epochMs: number;
  public readonly uptimeSec: number;

  public constructor(args: {
    timestamp: string;
    epochMs: number;
    uptimeSec: number;
  }) {
    this.ok = true;
    this.timestamp = args.timestamp;
    this.epochMs = args.epochMs;
    this.uptimeSec = args.uptimeSec;
  }
}
