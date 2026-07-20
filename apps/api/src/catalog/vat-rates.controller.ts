import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CatalogListQueryDto } from './dto/catalog-list-query.dto';
import { CreateVatRateDto } from './dto/create-vat-rate.dto';
import { UpdateVatRateDto } from './dto/update-vat-rate.dto';
import { VatRatesService } from './vat-rates.service';

@Controller('vat-rates')
export class VatRatesController {
  constructor(private readonly vatRatesService: VatRatesService) {}

  @Get()
  list(@CurrentAuth() auth: AuthContext, @Query() query: CatalogListQueryDto) {
    return this.vatRatesService.list(auth, query);
  }

  @Get(':vatRateId')
  get(
    @CurrentAuth() auth: AuthContext,
    @Param('vatRateId', ParseUUIDPipe) vatRateId: string,
  ) {
    return this.vatRatesService.get(auth, vatRateId);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Post()
  create(@CurrentAuth() auth: AuthContext, @Body() dto: CreateVatRateDto) {
    return this.vatRatesService.create(auth, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Patch(':vatRateId')
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('vatRateId', ParseUUIDPipe) vatRateId: string,
    @Body() dto: UpdateVatRateDto,
  ) {
    return this.vatRatesService.update(auth, vatRateId, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Delete(':vatRateId')
  archive(
    @CurrentAuth() auth: AuthContext,
    @Param('vatRateId', ParseUUIDPipe) vatRateId: string,
  ) {
    return this.vatRatesService.archive(auth, vatRateId);
  }
}
