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
import { CatalogListQueryDto } from './dto/catalog-list-query.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { UpsertLocationProductDto } from './dto/upsert-location-product.dto';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  list(@CurrentAuth() auth: AuthContext, @Query() query: CatalogListQueryDto) {
    return this.productsService.list(auth, query);
  }

  @Get(':productId')
  get(
    @CurrentAuth() auth: AuthContext,
    @Param('productId', ParseUUIDPipe) productId: string,
  ) {
    return this.productsService.get(auth, productId);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Post()
  create(@CurrentAuth() auth: AuthContext, @Body() dto: CreateProductDto) {
    return this.productsService.create(auth, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Patch(':productId')
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(auth, productId, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Delete(':productId')
  archive(
    @CurrentAuth() auth: AuthContext,
    @Param('productId', ParseUUIDPipe) productId: string,
  ) {
    return this.productsService.archive(auth, productId);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Post(':productId/variants')
  createVariant(
    @CurrentAuth() auth: AuthContext,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: CreateVariantDto,
  ) {
    return this.productsService.createVariant(auth, productId, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Patch(':productId/variants/:variantId')
  updateVariant(
    @CurrentAuth() auth: AuthContext,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() dto: UpdateVariantDto,
  ) {
    return this.productsService.updateVariant(auth, productId, variantId, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Put(':productId/locations/:locationId')
  upsertLocation(
    @CurrentAuth() auth: AuthContext,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: UpsertLocationProductDto,
  ) {
    return this.productsService.upsertLocation(
      auth,
      productId,
      locationId,
      dto,
    );
  }
}
