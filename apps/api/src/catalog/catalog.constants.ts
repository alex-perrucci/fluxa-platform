export const CATALOG_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export const PRODUCT_UNITS = ['EACH', 'WEIGHT', 'VOLUME'] as const;

export type CatalogStatusValue = (typeof CATALOG_STATUSES)[number];
export type ProductUnitValue = (typeof PRODUCT_UNITS)[number];
