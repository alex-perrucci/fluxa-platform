import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogQueryService } from './catalog-query.service';
import { CatalogReferencesService } from './catalog-references.service';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { PricingController } from './pricing.controller';
import { PricingService } from './pricing.service';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { VatRatesController } from './vat-rates.controller';
import { VatRatesService } from './vat-rates.service';

@Module({
  controllers: [
    CatalogController,
    VatRatesController,
    CategoriesController,
    ProductsController,
    PricingController,
  ],
  providers: [
    CatalogReferencesService,
    CatalogQueryService,
    VatRatesService,
    CategoriesService,
    ProductsService,
    PricingService,
  ],
})
export class CatalogModule {}
