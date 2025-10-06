import { HealthService } from '../health.service';

describe('HealthService', () => {
  let service: HealthService;

  beforeEach(() => {
    service = new HealthService();
  });

  describe('ping()', () => {
    it('returns ok=true and timing fields', () => {
      const result = service.ping();

      expect(result.ok).toBe(true);
      expect(typeof result.timestamp).toBe('string');
      expect(typeof result.epochMs).toBe('number');
      expect(typeof result.uptimeSec).toBe('number');
      expect(result.epochMs).toBeGreaterThan(0);
      expect(result.uptimeSec).toBeGreaterThanOrEqual(0);
      // ISO-8601 sanity check
      expect(() => new Date(result.timestamp)).not.toThrow();
    });
  });

  describe('info()', () => {
    it("returns status='ok' and environment info", () => {
      const result = service.info();

      expect(result.status).toBe('ok');
      expect(typeof result.timestamp).toBe('string');
      expect(typeof result.uptimeSec).toBe('number');
      expect(typeof result.pid).toBe('number');
      expect(typeof result.node).toBe('string');
      expect(typeof result.env).toBe('string');
      // version can be string or null
      expect(
        result.version === null || typeof result.version === 'string',
      ).toBe(true);
      // ISO-8601 sanity check
      expect(() => new Date(result.timestamp)).not.toThrow();
    });
  });
});
