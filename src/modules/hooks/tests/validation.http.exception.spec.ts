import { ValidationHttpException } from '../../../lib/errors/ValidationHttpException';

describe('ValidationHttpException', () => {
  it('produces standardized payload', () => {
    const ex = new ValidationHttpException([
      { path: '/title', keyword: 'minLength', message: 'too short' },
    ]);
    const res = ex.getResponse() as Record<string, unknown>;
    expect(res['error']).toBe('ValidationError');
    expect(res['message']).toBe('Validation failed');
    const details = res['details'] as Array<Record<string, unknown>>;
    expect(Array.isArray(details)).toBe(true);
    expect(details[0]?.['path']).toBe('/title');
  });
});
