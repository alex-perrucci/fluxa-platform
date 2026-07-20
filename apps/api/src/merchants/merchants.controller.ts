import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateMerchantDto } from './dto/create-merchant.dto';
import { UpdateMerchantDto } from './dto/update-merchant.dto';
import { MerchantsService } from './merchants.service';

@Controller('merchants')
export class MerchantsController {
  constructor(private readonly merchantsService: MerchantsService) {}

  @Get()
  list(@CurrentAuth() auth: AuthContext) {
    return this.merchantsService.list(auth);
  }

  @Get(':merchantId')
  get(
    @CurrentAuth() auth: AuthContext,
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
  ) {
    return this.merchantsService.get(auth, merchantId);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Post()
  create(@CurrentAuth() auth: AuthContext, @Body() dto: CreateMerchantDto) {
    return this.merchantsService.create(auth, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Patch(':merchantId')
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @Body() dto: UpdateMerchantDto,
  ) {
    return this.merchantsService.update(auth, merchantId, dto);
  }
}
