// Response DTO for GET /api/health/info
// Side-effect free, explicitly typed.

export class InfoResponseDto {
  public readonly status: 'ok';
  public readonly timestamp: string; // ISO-8601
  public readonly uptimeSec: number;
  public readonly pid: number;
  public readonly node: string;
  public readonly env: string;
  public readonly version: string | null;

  public constructor(args: {
    timestamp: string;
    uptimeSec: number;
    pid: number;
    node: string;
    env: string;
    version: string | null;
  }) {
    this.status = 'ok';
    this.timestamp = args.timestamp;
    this.uptimeSec = args.uptimeSec;
    this.pid = args.pid;
    this.node = args.node;
    this.env = args.env;
    this.version = args.version;
  }
}
