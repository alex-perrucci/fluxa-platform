// PHASE_3_EVENTS_MODULE
import { Injectable } from '@nestjs/common';
import type { AuthContext } from '../auth/auth.types';
import { LocationAccessService } from '../auth/location-access.service';

@Injectable()
export class EventsAccessService {
  constructor(private readonly locationAccess: LocationAccessService) {}

  assertLocation(auth: AuthContext, locationId: string) {
    return this.locationAccess.assert(
      auth,
      locationId,
      auth.role === 'MANAGER' ? 'manage_events' : undefined,
    );
  }
}
