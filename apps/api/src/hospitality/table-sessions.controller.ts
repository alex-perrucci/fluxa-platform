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
import { AttachOrderDto } from './dto/attach-order.dto';
import { CloseTableSessionDto } from './dto/close-table-session.dto';
import { MoveTableSessionDto } from './dto/move-table-session.dto';
import { OpenTableSessionDto } from './dto/open-table-session.dto';
import { TableSessionListQueryDto } from './dto/table-session-list-query.dto';
import { UpdateTableSessionDto } from './dto/update-table-session.dto';
import { HospitalityService } from './hospitality.service';
@Controller()
export class TableSessionsController {
  constructor(private readonly service: HospitalityService) {}
  @Get('floor') floor(
    @CurrentAuth() auth: AuthContext,
    @Query('locationId', ParseUUIDPipe) locationId: string,
  ) {
    return this.service.floor(auth, locationId);
  }
  @Get('table-sessions') list(
    @CurrentAuth() auth: AuthContext,
    @Query() query: TableSessionListQueryDto,
  ) {
    return this.service.listSessions(auth, query);
  }
  @Get('table-sessions/:sessionId') get(
    @CurrentAuth() auth: AuthContext,
    @Param('sessionId', ParseUUIDPipe) id: string,
  ) {
    return this.service.getSession(auth, id);
  }
  @Roles('OWNER', 'ADMIN', 'MANAGER', 'CASHIER', 'WAITER')
  @Post('table-sessions')
  open(@CurrentAuth() auth: AuthContext, @Body() dto: OpenTableSessionDto) {
    return this.service.openSession(auth, dto);
  }
  @Roles('OWNER', 'ADMIN', 'MANAGER', 'CASHIER', 'WAITER')
  @Patch('table-sessions/:sessionId')
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('sessionId', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTableSessionDto,
  ) {
    return this.service.updateSession(auth, id, dto);
  }
  @Roles('OWNER', 'ADMIN', 'MANAGER', 'CASHIER', 'WAITER')
  @Post('table-sessions/:sessionId/orders')
  attach(
    @CurrentAuth() auth: AuthContext,
    @Param('sessionId', ParseUUIDPipe) id: string,
    @Body() dto: AttachOrderDto,
  ) {
    return this.service.attachOrder(auth, id, dto);
  }
  @Roles('OWNER', 'ADMIN', 'MANAGER', 'CASHIER', 'WAITER')
  @Post('table-sessions/:sessionId/move')
  move(
    @CurrentAuth() auth: AuthContext,
    @Param('sessionId', ParseUUIDPipe) id: string,
    @Body() dto: MoveTableSessionDto,
  ) {
    return this.service.moveSession(auth, id, dto);
  }
  @Roles('OWNER', 'ADMIN', 'MANAGER', 'CASHIER', 'WAITER')
  @Post('table-sessions/:sessionId/close')
  close(
    @CurrentAuth() auth: AuthContext,
    @Param('sessionId', ParseUUIDPipe) id: string,
    @Body() dto: CloseTableSessionDto,
  ) {
    return this.service.closeSession(auth, id, dto);
  }
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Post('table-sessions/:sessionId/cancel')
  cancel(
    @CurrentAuth() auth: AuthContext,
    @Param('sessionId', ParseUUIDPipe) id: string,
    @Body() dto: CloseTableSessionDto,
  ) {
    return this.service.cancelSession(auth, id, dto);
  }
}
