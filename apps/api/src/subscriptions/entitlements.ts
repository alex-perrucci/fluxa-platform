export const SUBSCRIPTION_PLANS = ['START', 'SALA', 'PRO'] as const;
export type SubscriptionPlan = (typeof SUBSCRIPTION_PLANS)[number];

export const SUBSCRIPTION_STATUSES = ['ACTIVE', 'TRIAL', 'SUSPENDED'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const ENTITLEMENTS = [
  'POS_CORE',
  'CATALOG',
  'ORDERS',
  'PAYMENTS',
  'RECEIPT_PRINTING',
  'FISCAL',
  'TABLES',
  'FLOOR_PLAN',
  'TABLE_SERVICE',
  'KITCHEN',
  'KITCHEN_ROUTING',
  'KITCHEN_PRINTING',
  'KDS',
] as const;
export type Entitlement = (typeof ENTITLEMENTS)[number];

const START_ENTITLEMENTS = [
  'POS_CORE',
  'CATALOG',
  'ORDERS',
  'PAYMENTS',
  'RECEIPT_PRINTING',
  'FISCAL',
] as const satisfies readonly Entitlement[];

const SALA_ENTITLEMENTS = [
  ...START_ENTITLEMENTS,
  'TABLES',
  'FLOOR_PLAN',
  'TABLE_SERVICE',
] as const satisfies readonly Entitlement[];

export const PLAN_ENTITLEMENTS: Record<
  SubscriptionPlan,
  readonly Entitlement[]
> = {
  START: START_ENTITLEMENTS,
  SALA: SALA_ENTITLEMENTS,
  PRO: [
    ...SALA_ENTITLEMENTS,
    'KITCHEN',
    'KITCHEN_ROUTING',
    'KITCHEN_PRINTING',
    'KDS',
  ],
};

export const PLAN_PRESENTATION: Record<
  SubscriptionPlan,
  { name: string; description: string; includedFeatures: readonly string[] }
> = {
  START: {
    name: 'Fluxa Start',
    description: 'Cassa, catalogo, pagamenti, stampa e fiscalizzazione',
    includedFeatures: [
      'Cassa',
      'Prodotti e categorie',
      'Ordini',
      'Pagamenti',
      'Stampa ricevute',
      'Fiscalizzazione',
    ],
  },
  SALA: {
    name: 'Fluxa Sala',
    description: 'Cassa + gestione sala e tavoli',
    includedFeatures: [
      'Cassa',
      'Prodotti e categorie',
      'Pagamenti',
      'Tavoli',
      'Piantina',
      'Servizio al tavolo',
    ],
  },
  PRO: {
    name: 'Fluxa Pro',
    description: 'Cassa, sala e workflow cucina completo',
    includedFeatures: [
      'Cassa',
      'Prodotti e categorie',
      'Pagamenti',
      'Tavoli',
      'Piantina',
      'Cucina',
      'Routing comande',
      'Stampa cucina',
      'KDS',
    ],
  },
};

const PLAN_ORDER: readonly SubscriptionPlan[] = ['START', 'SALA', 'PRO'];

export function requiredPlanForEntitlement(
  entitlement: Entitlement,
): SubscriptionPlan {
  return (
    PLAN_ORDER.find((plan) => PLAN_ENTITLEMENTS[plan].includes(entitlement)) ??
    'PRO'
  );
}
