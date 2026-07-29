// PHASE_10_RESERVATION_OPERATIONS
export type EventStatus =
  'DRAFT' | 'PUBLISHED' | 'SOLD_OUT' | 'CANCELLED' | 'COMPLETED' | 'ARCHIVED';

export type ReservationStatus =
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

export interface LocationSummary {
  id: string;
  merchantId: string;
  code: string;
  name: string;
  city: string;
  province: string | null;
  timezone: string;
  status: string;
}

export interface DiningTableSummary {
  id: string;
  locationId: string;
  areaId: string;
  areaName: string;
  code: string;
  name: string;
  capacity: number;
  status: string;
}

export interface EventSummary {
  id: string;
  organizationId: string;
  locationId: string;
  title: string;
  slug: string;
  description: string;
  timezone: string;
  status: EventStatus;
  coverImageUrl: string | null;
  startsAt: string;
  endsAt: string;
  bookingOpensAt: string;
  bookingClosesAt: string;
  bookingAmountCents: number;
  currency: string;
  capacity: number;
  cancellationPolicy: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface EventDetail extends EventSummary {
  tables: Array<{
    diningTableId: string;
    tableCode: string;
    tableName: string;
    tableCapacity: number;
    areaName: string;
    enabled: boolean;
  }>;
  bookingRules: {
    minPartySize: number;
    maxPartySize: number;
    holdMinutes: number;
    bookingCutoffMinutes: number;
    cancellationCutoffMinutes: number;
    autoAssignSmallestTable: boolean;
    allowManualAssignment: boolean;
    requirePhone: boolean;
  } | null;
}

export interface EventListResponse {
  items: EventSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ReservationRow {
  id: string;
  eventId?: string;
  confirmationCode: string;
  status: ReservationStatus;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string | null;
  partySize: number;
  amountCents: number;
  platformFeeCents?: number;
  merchantNetCents?: number;
  refundedCents?: number;
  currency: string;
  version: number;
  eventTitle: string;
  eventStartsAt?: string;
  tableId?: string | null;
  tableCode?: string | null;
  tableName?: string | null;
  tableSessionId?: string | null;
  tableSessionStatus?: 'OPEN' | 'CLOSED' | 'CANCELLED' | null;
  checkedInAt?: string | null;
  seatedAt?: string | null;
  createdAt: string;
}

export interface ReservationDetail extends ReservationRow {
  organizationId: string;
  locationId: string;
  customerEmail: string;
  customerPhone: string | null;
  customerNote: string | null;
  providerFeeCents: number;
  eventSlug: string;
  eventEndsAt: string;
  locationName: string;
  timezone: string;
  tableCapacity: number | null;
  areaName: string | null;
  tableSessionGuestCount: number | null;
  tableSessionVersion: number | null;
  tableSessionOpenedAt: string | null;
  tableSessionClosedAt: string | null;
  orderCount: number;
  orderTotalCents: number;
  confirmedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  noShowAt: string | null;
  updatedAt: string;
  history: Array<{
    fromStatus: ReservationStatus | null;
    toStatus: ReservationStatus;
    reason: string | null;
    metadata: Record<string, unknown>;
    createdAt: string;
  }>;
}

export interface ReservationFeedResponse {
  items: Array<{
    id: string;
    topic: string;
    aggregateType: string;
    aggregateId: string;
    payload: Record<string, unknown>;
    createdAt: string;
  }>;
  cursor: {
    after: string;
    afterId: string | null;
  };
}

export interface MerchantOverview {
  location: { id: string; name: string; timezone: string };
  metrics: {
    events: number;
    publishedEvents: number;
    upcomingEvents: number;
    reservations: number;
    confirmedGuests: number;
    refundPending: number;
    paidVolumeCents: string;
  };
  recentEvents: EventSummary[];
  recentReservations: ReservationRow[];
}

export interface ReservationListResponse {
  items: ReservationRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface OrganizationListItem {
  id: string;
  name: string;
  slug: string;
  status: 'ACTIVE' | 'SUSPENDED';
  createdAt: string;
  createdByEmail?: string | null;
}

export interface PlatformOverview {
  metrics: {
    organizations: number;
    activeOrganizations: number;
    users: number;
    events: number;
    reservations: number;
    refundPending: number;
    paidVolumeCents: string;
  };
  recentOrganizations: OrganizationListItem[];
}

export interface PlatformOrganizationDetail {
  organization: OrganizationListItem;
  metrics: {
    merchants: number;
    locations: number;
    members: number;
    events: number;
    reservations: number;
    paidVolumeCents: string;
  };
  merchants: Array<{
    id: string;
    legalName: string;
    tradeName: string | null;
    vatNumber: string;
    status: string;
  }>;
  locations: Array<{
    id: string;
    merchantId: string;
    code: string;
    name: string;
    city: string;
    province: string | null;
    timezone: string;
    status: string;
  }>;
  members: Array<{
    membershipId: string;
    userId: string;
    displayName: string;
    email: string;
    role: string;
    status: string;
    defaultLocationName: string | null;
  }>;
}
