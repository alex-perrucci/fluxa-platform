import { AdeAutomationError } from './ade-automation-error';
import { validateAdeDcoReadPath } from './ade-dco-http.client';

describe('validateAdeDcoReadPath', () => {
  it('accepts only read paths inside the known AdE DCO namespaces', () => {
    expect(
      validateAdeDcoReadPath('/ser/api/documenti/v1/example?limit=1'),
    ).toBe('/ser/api/documenti/v1/example?limit=1');
    expect(validateAdeDcoReadPath('/common/example/v1/me')).toBe(
      '/common/example/v1/me',
    );
  });

  it.each([
    'https://example.com/ser/api/documenti',
    '//example.com/ser/api/documenti',
    '/private/api/documenti',
    '/ser/api/documenti#fragment',
  ])('rejects paths outside the explicit read-only allowlist: %s', (path) => {
    expect(() => validateAdeDcoReadPath(path)).toThrow(AdeAutomationError);
  });
});
