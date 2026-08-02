import { Injectable } from '@nestjs/common';
import type { AuthContext } from '../auth/auth.types';
import { LocationAccessService } from '../auth/location-access.service';

@Injectable()
export class HospitalityAccessService {
  constructor(private readonly locationAccess: LocationAccessService) {}

  assertLocation(auth: AuthContext, locationId: string) {
    return this.locationAccess.assert(
      auth,
      locationId,
      auth.role === 'MANAGER' ? 'manage_tables' : undefined,
    );
  }
}
