import {
  classifyAdeDcoHttpFailure,
  classifyAdeDcoNavigationFailure,
} from './ade-dco-bootstrap-guard';

describe('DCO bootstrap fail-fast classification', () => {
  it.each([401, 403])(
    'classifies HTTP %s from DCO APIs as an invalid session',
    (status) => {
      const error = classifyAdeDcoHttpFailure(
        'https://ivaservizi.agenziaentrate.gov.it/ser/api/documenti/v1/doc/documenti/ultimo/',
        status,
      );

      expect(error?.code).toBe('ADE_SESSION_INVALID');
      expect(error?.category).toBe('AUTH_REQUIRED');
      expect(error?.retrySafe).toBe(false);
      expect(error?.submitAttempted).toBe(false);
    },
  );

  it.each([500, 502, 503, 504])(
    'classifies HTTP %s from the DCO bootstrap as upstream unavailable',
    (status) => {
      const error = classifyAdeDcoHttpFailure(
        'https://ivaservizi.agenziaentrate.gov.it/ser/documenticommercialionline/',
        status,
      );

      expect(error?.code).toBe('ADE_UPSTREAM_UNAVAILABLE');
      expect(error?.category).toBe('NAVIGATION');
      expect(error?.retrySafe).toBe(true);
      expect(error?.submitAttempted).toBe(false);
    },
  );

  it('does not classify a normal 400 API response by itself', () => {
    expect(
      classifyAdeDcoHttpFailure(
        'https://ivaservizi.agenziaentrate.gov.it/common/testata/v1/info/me',
        400,
      ),
    ).toBeNull();
  });

  it('ignores failures from non-critical static assets', () => {
    expect(
      classifyAdeDcoHttpFailure(
        'https://ivaservizi.agenziaentrate.gov.it/ser/documenticommercialionline/css/app.bundle.css',
        503,
      ),
    ).toBeNull();
  });

  it('classifies the DCO nonauth page as an invalid session', () => {
    const error = classifyAdeDcoNavigationFailure(
      'https://ivaservizi.agenziaentrate.gov.it/ser/documenticommercialionline/nonauth.html',
    );

    expect(error?.code).toBe('ADE_SESSION_INVALID');
  });

  it.each([
    'https://ivaservizi.agenziaentrate.gov.it/ser/documenticommercialionline/error.html',
    'https://ivaservizi.agenziaentrate.gov.it/instr/InstradamentofcWeb/error',
  ])('classifies an AdE error page as upstream unavailable: %s', (url) => {
    const error = classifyAdeDcoNavigationFailure(url);

    expect(error?.code).toBe('ADE_UPSTREAM_UNAVAILABLE');
    expect(error?.retrySafe).toBe(true);
  });

  it('ignores the normal DCO page', () => {
    expect(
      classifyAdeDcoNavigationFailure(
        'https://ivaservizi.agenziaentrate.gov.it/ser/documenticommercialionline/',
      ),
    ).toBeNull();
  });
});
