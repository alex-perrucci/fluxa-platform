// PHASE_9_PUBLIC_BOOKING
export type PublicBookingState =
  'NOT_OPEN' | 'OPEN' | 'CLOSED' | 'SOLD_OUT' | 'ENDED';

export interface PublicEventSummary {
  id: string;
  title: string;
  slug: string;
  description: string;
  timezone: string;
  status: 'PUBLISHED' | 'SOLD_OUT';
  bookingState: PublicBookingState;
  coverImageUrl: string | null;
  startsAt: string;
  endsAt: string;
  bookingOpensAt: string;
  bookingClosesAt: string;
  bookingAmountCents: number;
  currency: string;
  capacity: number;
  remainingCapacity: number;
  organizer: {
    name: string;
  };
  location: {
    name: string;
    city: string;
    province: string | null;
  };
}

export interface PublicEventDetail extends PublicEventSummary {
  cancellationPolicy: string | null;
  bookingRules: {
    minPartySize: number;
    maxPartySize: number;
    holdMinutes: number;
    bookingCutoffMinutes: number;
    cancellationCutoffMinutes: number;
    requirePhone: boolean;
  };
  inventory: {
    tableCount: number;
    totalTableCapacity: number;
    remainingCapacity: number;
  };
}

export interface PublicEventListResponse {
  items: PublicEventSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PublicAvailability {
  event: {
    slug: string;
    title: string;
    startsAt: string;
    timezone: string;
    bookingAmountCents: number;
    currency: string;
  };
  partySize: number;
  available: boolean;
  availableTableCount: number;
  smallestTableCapacity: number | null;
  remainingCapacity: number;
  holdMinutes: number;
}

export interface PublicHold {
  holdToken?: string;
  id: string;
  status: 'ACTIVE' | 'CONVERTED' | 'EXPIRED' | 'CANCELLED';
  partySize: number;
  amountCents: number;
  platformFeeCents: number;
  merchantGrossCents: number;
  currency: string;
  expiresAt: string;
  event: {
    slug: string;
    title: string;
    startsAt: string;
  };
  table: {
    id: string;
    name: string | null;
    capacity: number | null;
  } | null;
}

export type PublicReservationStatus =
  | 'PENDING_PAYMENT'
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'SEATED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'NO_SHOW'
  | 'REFUND_PENDING'
  | 'REFUNDED';

export interface PublicReservation {
  reservationToken?: string;
  id: string;
  confirmationCode: string;
  status: PublicReservationStatus;
  customer: {
    name: string;
    email: string;
    phone: string | null;
    note: string | null;
  };
  partySize: number;
  event: {
    slug: string;
    title: string;
    startsAt: string;
    timezone: string;
  };
  table: {
    id: string;
    name: string | null;
    capacity: number | null;
  } | null;
  payment: {
    required: boolean;
    amountCents: number;
    currency: string;
    status: PublicReservationStatus;
    expiresAt: string | null;
    nextAction: 'CREATE_CHECKOUT_SESSION' | 'NONE';
  };
  createdAt: string;
  updatedAt: string;
}

export interface PublicCheckoutSession {
  reservationPaymentId: string;
  provider: 'STRIPE';
  providerSessionId: string;
  status: string | null;
  paymentStatus: string;
  checkoutUrl: string;
  expiresAt: string;
}
