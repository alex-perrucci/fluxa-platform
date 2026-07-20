import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AssignPriceListDto } from './dto/assign-price-list.dto';
import { CatalogListQueryDto } from './dto/catalog-list-query.dto';
import { CreatePriceListDto } from './dto/create-price-list.dto';
import { UpdatePriceListDto } from './dto/update-price-list.dto';
import { UpsertProductPriceDto } from './dto/upsert-product-price.dto';
import { PricingService } from './pricing.service';

@Controller('price-lists')
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  @Get()
  list(@CurrentAuth() auth: AuthContext, @Query() query: CatalogListQueryDto) {
    return this.pricingService.listPriceLists(auth, query);
  }

  @Get(':priceListId')
  get(
    @CurrentAuth() auth: AuthContext,
    @Param('priceListId', ParseUUIDPipe) priceListId: string,
  ) {
    return this.pricingService.getPriceList(auth, priceListId);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Post()
  create(@CurrentAuth() auth: AuthContext, @Body() dto: CreatePriceListDto) {
    return this.pricingService.createPriceList(auth, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Patch(':priceListId')
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('priceListId', ParseUUIDPipe) priceListId: string,
    @Body() dto: UpdatePriceListDto,
  ) {
    return this.pricingService.updatePriceList(auth, priceListId, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Put(':priceListId/locations')
  assign(
    @CurrentAuth() auth: AuthContext,
    @Param('priceListId', ParseUUIDPipe) priceListId: string,
    @Body() dto: AssignPriceListDto,
  ) {
    return this.pricingService.assignPriceList(auth, priceListId, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Put(':priceListId/prices')
  upsertPrice(
    @CurrentAuth() auth: AuthContext,
    @Param('priceListId', ParseUUIDPipe) priceListId: string,
    @Body() dto: UpsertProductPriceDto,
  ) {
    return this.pricingService.upsertProductPrice(auth, priceListId, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Delete(':priceListId/prices/:priceId')
  archivePrice(
    @CurrentAuth() auth: AuthContext,
    @Param('priceListId', ParseUUIDPipe) priceListId: string,
    @Param('priceId', ParseUUIDPipe) priceId: string,
  ) {
    return this.pricingService.archiveProductPrice(auth, priceListId, priceId);
  }
}
