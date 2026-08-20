export const merchantNavigation = [
  { href: '/merchant', label: 'Home', icon: 'dashboard' },
  { href: '/merchant/catalog', label: 'Menu', icon: 'money' },
  { href: '/merchant/venue', label: 'Locale', icon: 'building' },
  { href: '/merchant/operations', label: 'Operatività', icon: 'activity' },
  { href: '/merchant/sales', label: 'Vendite', icon: 'money' },
  { href: '/merchant/settings', label: 'Impostazioni', icon: 'shield' },
] as const;

export const merchantLegacyDetailRoutes = [
  '/merchant/location',
  '/merchant/floor-plan',
  '/merchant/kitchen-configuration',
  '/merchant/pos-configuration',
  '/merchant/events',
  '/merchant/reservations',
  '/merchant/payments',
  '/merchant/fiscal-documents',
  '/merchant/reports',
  '/merchant/fiscal-configuration',
  '/merchant/health',
] as const;
