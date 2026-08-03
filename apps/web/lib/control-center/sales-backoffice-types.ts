export interface BackofficeScope {
  kind: 'ALL' | 'LOCATION';
  location: { id: string; name: string; timezone: string } | null;
  locations: Array<{ id: string; name: string; timezone: string }>;
}

export interface SalesOrderRow {
  id: string;
  locationId: string;
  locationName: string;
  number: string;
  businessDate: string;
  status: string;
  serviceMode: string;
  customerNote: string | null;
  currency: string;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  netTotalCents: number;
  taxTotalCents: number;
  paidCents: number;
  paymentMethods: string;
  fiscalStatus: string | null;
  fiscalDocumentNumber: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResponse<T> {
  scope: BackofficeScope;
  page: number;
  pageSize: number;
  total: number;
  items: T[];
}

export interface SalesOrderDetail extends SalesOrderRow {
  version: number;
  heldAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  items: Array<{
    id: string;
    productName: string;
    variantName: string | null;
    quantityAmount: number;
    quantityScale: number;
    unitPriceCents: number;
    grossTotalCents: number;
    discountCents: number;
    finalGrossCents: number;
    finalNetCents: number;
    finalTaxCents: number;
    vatCode: string;
    vatRateBasisPoints: number;
    note: string | null;
  }>;
  adjustments: Array<{
    id: string;
    type: string;
    value: number;
    reason: string;
    appliedCents: number;
    createdAt: string;
  }>;
  vatSummaries: Array<{
    vatKey: string;
    vatRateBasisPoints: number;
    vatNatureCode: string | null;
    grossCents: number;
    netCents: number;
    taxCents: number;
  }>;
  payments: PaymentRow[];
  fiscalDocuments: FiscalDocumentRow[];
}

export interface PaymentRow {
  id: string;
  locationId: string;
  locationName: string;
  orderId: string;
  orderNumber: string;
  method: string;
  provider: string;
  status: string;
  amountCents: number;
  tenderedCents: number | null;
  changeCents: number;
  providerReference: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  capturedAt: string | null;
  createdAt: string;
}

export interface FiscalDocumentRow {
  id: string;
  locationId: string;
  locationName: string;
  orderId: string;
  orderNumber: string;
  type: string;
  status: string;
  provider: string;
  environment: string;
  currency: string;
  totalCents: number;
  cashPaymentCents: number;
  electronicPaymentCents: number;
  documentNumber: string | null;
  documentDate: string | null;
  externalStatus: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  attempts: number;
  issuedAt: string | null;
  createdAt: string;
}

export interface SalesReport {
  scope: BackofficeScope;
  totals: {
    todayCents: string;
    weekCents: string;
    monthCents: string;
    bookingDepositsCents: string;
    paidOrders: number;
  };
  byLocation: Array<{
    locationId: string;
    locationName: string;
    orders: number;
    posRevenueCents: string;
  }>;
  byMethod: Array<{
    method: string;
    payments: number;
    orders: number;
    posRevenueCents: string;
  }>;
  daily: Array<{
    date: string;
    orders: number;
    posRevenueCents: string;
  }>;
}
