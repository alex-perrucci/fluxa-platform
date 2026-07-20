import {
  Body,
  Controller,
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
import { CreateDiningTableDto } from './dto/create-dining-table.dto';
import { UpdateDiningTableDto } from './dto/update-dining-table.dto';
import { HospitalityService } from './hospitality.service';
@Controller('dining-tables')
export class DiningTablesController {
  constructor(private readonly service: HospitalityService) {}
  @Get() list(
    @CurrentAuth() auth: AuthContext,
    @Query('locationId', ParseUUIDPipe) locationId: string,
  ) {
    return this.service.listTables(auth, locationId);
  }
  @Roles('OWNER', 'ADMIN', 'MANAGER') @Post() create(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateDiningTableDto,
  ) {
    return this.service.createTable(auth, dto);
  }
  @Roles('OWNER', 'ADMIN', 'MANAGER') @Patch(':tableId') update(
    @CurrentAuth() auth: AuthContext,
    @Param('tableId', ParseUUIDPipe) tableId: string,
    @Body() dto: UpdateDiningTableDto,
  ) {
    return this.service.updateTable(auth, tableId, dto);
  }
}
