import { describe, expect, it } from 'vitest';
import { controlCenterErrorView } from './error-policy';

describe('controlCenterErrorView', () => {
  it('translates device/location errors into actionable copy', () => {
    expect(controlCenterErrorView('DEVICE_LOCATION_ACCESS_DENIED', 403)).toEqual({
      category: 'DEVICE_WRONG_LOCATION',
      message: 'Questo dispositivo è assegnato a un’altra sede.',
    });
    expect(controlCenterErrorView('DEVICE_ASSIGNMENT_NOT_FOUND', 404)).toEqual({
      category: 'DEVICE_NOT_ASSIGNED',
      message: 'Questo dispositivo non è ancora assegnato a una sede.',
    });
  });

  it('does not expose raw server errors as primary copy', () => {
    expect(controlCenterErrorView('SOME_INTERNAL_FAILURE', 500)).toEqual({
      category: 'SERVER_ERROR',
      message: 'Non è stato possibile completare l’operazione. Riprova tra poco.',
    });
  });
});
