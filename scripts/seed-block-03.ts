import { and, asc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import {
  categories,
  locationPriceLists,
  locations,
  organizations,
  priceLists,
  productPrices,
  products,
  vatRates,
} from '../libs/database/src/schema';
import { buildPriceKey } from '../apps/api/src/catalog/catalog-policy';

try {
  process.loadEnvFile('.env');
} catch {
  // Environment variables may already be provided by the host.
}

const databaseUrl = process.env.DATABASE_URL;
const useSsl = process.env.DATABASE_SSL === 'true';
const requestedOrganizationId =
  process.env.CATALOG_SEED_ORGANIZATION_ID?.trim() || null;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required.');
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: useSsl ? { rejectUnauthorized: true } : false,
});

const db = drizzle(pool);

async function main(): Promise<void> {
  const [organization] = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(
      requestedOrganizationId
        ? and(
            eq(organizations.id, requestedOrganizationId),
            eq(organizations.status, 'ACTIVE'),
          )
        : eq(organizations.status, 'ACTIVE'),
    )
    .orderBy(asc(organizations.createdAt))
    .limit(1);

  if (!organization) {
    console.log(
      JSON.stringify({
        action: 'skipped',
        reason: 'NO_ACTIVE_ORGANIZATION',
      }),
    );
    return;
  }

  const [location] = await db
    .select({ id: locations.id, name: locations.name })
    .from(locations)
    .where(
      and(
        eq(locations.organizationId, organization.id),
        eq(locations.status, 'ACTIVE'),
      ),
    )
    .orderBy(asc(locations.createdAt))
    .limit(1);

  if (!location) {
    console.log(
      JSON.stringify({
        action: 'skipped',
        reason: 'NO_ACTIVE_LOCATION',
        organizationId: organization.id,
      }),
    );
    return;
  }

  const [vat10] = await db
    .insert(vatRates)
    .values({
      organizationId: organization.id,
      code: 'IVA10',
      name: 'IVA 10%',
      rateBasisPoints: 1000,
      isDefault: true,
    })
    .onConflictDoUpdate({
      target: [vatRates.organizationId, vatRates.code],
      set: {
        name: 'IVA 10%',
        rateBasisPoints: 1000,
        natureCode: null,
        isDefault: true,
        status: 'ACTIVE',
        updatedAt: new Date(),
      },
    })
    .returning();

  const [category] = await db
    .insert(categories)
    .values({
      organizationId: organization.id,
      code: 'BEVANDE',
      name: 'Bevande',
      sortOrder: 10,
    })
    .onConflictDoUpdate({
      target: [categories.organizationId, categories.code],
      set: {
        name: 'Bevande',
        sortOrder: 10,
        status: 'ACTIVE',
        updatedAt: new Date(),
      },
    })
    .returning();

  const [product] = await db
    .insert(products)
    .values({
      organizationId: organization.id,
      categoryId: category.id,
      vatRateId: vat10.id,
      code: 'CAFFE',
      sku: 'CAFFE',
      name: 'Caffè espresso',
      unit: 'EACH',
      quantityScale: 0,
    })
    .onConflictDoUpdate({
      target: [products.organizationId, products.code],
      set: {
        categoryId: category.id,
        vatRateId: vat10.id,
        name: 'Caffè espresso',
        status: 'ACTIVE',
        updatedAt: new Date(),
      },
    })
    .returning();

  const [priceList] = await db
    .insert(priceLists)
    .values({
      organizationId: organization.id,
      code: 'DEFAULT',
      name: 'Listino principale',
      currency: 'EUR',
      priority: 100,
    })
    .onConflictDoUpdate({
      target: [priceLists.organizationId, priceLists.code],
      set: {
        name: 'Listino principale',
        currency: 'EUR',
        priority: 100,
        status: 'ACTIVE',
        updatedAt: new Date(),
      },
    })
    .returning();

  await db
    .insert(locationPriceLists)
    .values({
      organizationId: organization.id,
      locationId: location.id,
      priceListId: priceList.id,
      priority: 100,
      active: true,
    })
    .onConflictDoUpdate({
      target: [locationPriceLists.locationId, locationPriceLists.priceListId],
      set: {
        priority: 100,
        active: true,
        updatedAt: new Date(),
      },
    });

  await db
    .insert(productPrices)
    .values({
      organizationId: organization.id,
      priceListId: priceList.id,
      productId: product.id,
      priceKey: buildPriceKey(product.id),
      amountCents: 120,
    })
    .onConflictDoUpdate({
      target: [productPrices.priceListId, productPrices.priceKey],
      set: {
        amountCents: 120,
        status: 'ACTIVE',
        updatedAt: new Date(),
      },
    });

  console.log(
    JSON.stringify({
      action: 'seeded',
      organizationId: organization.id,
      organizationName: organization.name,
      locationId: location.id,
      locationName: location.name,
      productId: product.id,
      priceListId: priceList.id,
    }),
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
