import { Socket } from 'node:net';

/** Options for waiting until a TCP endpoint is reachable. */
export interface TcpWaitOptions {
  readonly host: string;
  readonly port: number;
  /** Total time limit across all attempts. */
  readonly timeoutMs: number;
  /** Delay between attempts (and also the per-attempt socket timeout cap). */
  readonly intervalMs: number;
}

/** Error thrown when the TCP endpoint does not become reachable in time. */
export class TcpWaitError extends Error {
  public readonly host: string;
  public readonly port: number;
  public readonly timeoutMs: number;

  public constructor(
    host: string,
    port: number,
    timeoutMs: number,
    message?: string,
  ) {
    super(
      message ??
        `Timed out waiting for TCP ${host}:${port} after ${timeoutMs}ms`,
    );
    this.name = 'TcpWaitError';
    this.host = host;
    this.port = port;
    this.timeoutMs = timeoutMs;
  }
}

/** Sleep helper with proper typing. */
function delay(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const t = setTimeout(() => {
      clearTimeout(t);
      resolve();
    }, ms);
  });
}

/** Attempt a single TCP connection with its own timeout. */
async function tryConnectOnce(
  host: string,
  port: number,
  attemptTimeoutMs: number,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const socket = new Socket();

    const onSuccess = (): void => {
      cleanup();
      // Immediately destroy; we only probe connectivity.
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
      resolve();
    };

    const onFail = (err?: unknown): void => {
      cleanup();
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    const cleanup = (): void => {
      socket.removeAllListeners('connect');
      socket.removeAllListeners('error');
      socket.removeAllListeners('timeout');
    };

    socket.setTimeout(attemptTimeoutMs);
    socket.once('connect', onSuccess);
    socket.once('timeout', () => onFail(new Error('socket timeout')));
    socket.once('error', onFail);

    // Use connect options to avoid accidental implicit DNS family mismatch.
    socket.connect({ host, port });
  });
}

/**
 * Wait until a TCP endpoint becomes reachable, polling until the total timeout elapses.
 * Resolves when a connection succeeds; rejects with TcpWaitError otherwise.
 */
export async function waitForTcpOpen(options: TcpWaitOptions): Promise<void> {
  const start = Date.now();
  const { host, port, timeoutMs, intervalMs } = options;

  while (true) {
    const elapsed = Date.now() - start;
    if (elapsed >= timeoutMs) {
      throw new TcpWaitError(host, port, timeoutMs);
    }

    // Per-attempt timeout is capped by remaining time and interval; never below 50ms.
    const remaining = timeoutMs - elapsed;
    const perAttempt = Math.max(50, Math.min(intervalMs, remaining));

    try {
      await tryConnectOnce(host, port, perAttempt);
      return; // reachable
    } catch {
      // Not reachable yet — wait a bit and retry (but do not oversleep past the deadline).
      const delayMs = Math.min(
        intervalMs,
        Math.max(0, timeoutMs - (Date.now() - start)),
      );
      if (delayMs > 0) {
        await delay(delayMs);
      }
      // loop continues
    }
  }
}
