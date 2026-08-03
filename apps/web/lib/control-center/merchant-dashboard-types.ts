import type { EventSummary, ReservationRow } from './types';

export interface MerchantDashboardLocation {
  id: string;
  name: string;
  timezone: string;
  city: string;
}

export interface MerchantDashboardOverview {
  scope: {
    kind: 'ALL' | 'LOCATION';
    location: MerchantDashboardLocation | null;
    locations: MerchantDashboardLocation[];
  };
  metrics: {
    events: number;
    publishedEvents: number;
    upcomingEvents: number;
    reservations: number;
    confirmedGuests: number;
    refundPending: number;
    bookingDepositsCents: string;
    posOrders: number;
    posSalesCents: string;
  };
  recentEvents: Array<EventSummary & { locationName: string }>;
  recentReservations: Array<ReservationRow & { locationName: string }>;
}
