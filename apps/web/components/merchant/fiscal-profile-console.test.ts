import { describe, expect, it } from 'vitest';
import {
  FISCAL_PROVIDERS,
  providerLabel,
} from './fiscal-profile-console';

describe('FiscalProfileConsole providers', () => {
  it('exposes ADE_WEB in VenueOS with the Agenzia delle Entrate label', () => {
    expect(FISCAL_PROVIDERS).toContain('ADE_WEB');
    expect(providerLabel('ADE_WEB')).toBe('Agenzia delle Entrate');
  });
});
