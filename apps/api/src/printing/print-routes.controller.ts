import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
} from '@nestjs/common';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PrintRouteListQueryDto } from './dto/print-route-list-query.dto';
import { UpsertPrintRouteDto } from './dto/upsert-print-route.dto';
import { PrintersService } from './printers.service';

@Controller('print-routes')
export class PrintRoutesController {
  constructor(private readonly service: PrintersService) {}

  @Get()
  list(
    @CurrentAuth() auth: AuthContext,
    @Query() query: PrintRouteListQueryDto,
  ) {
    return this.service.listRoutes(auth, query);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Put()
  upsert(@CurrentAuth() auth: AuthContext, @Body() dto: UpsertPrintRouteDto) {
    return this.service.upsertRoute(auth, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Delete(':routeId')
  delete(
    @CurrentAuth() auth: AuthContext,
    @Param('routeId', ParseUUIDPipe) routeId: string,
  ) {
    return this.service.deleteRoute(auth, routeId);
  }
}
