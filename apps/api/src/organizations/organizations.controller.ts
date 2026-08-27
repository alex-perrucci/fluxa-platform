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
import { PlatformAdminOnly } from '../auth/decorators/platform-admin.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { TenantOptional } from '../auth/decorators/tenant-optional.decorator';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { CreateMemberDto } from './dto/create-member.dto';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { OrganizationsService } from './organizations.service';

@Controller('organizations')
export class OrganizationsController {
  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  @TenantOptional()
  @Get()
  list(@CurrentAuth() auth: AuthContext) {
    return this.organizationsService.listAccessible(auth);
  }

  @TenantOptional()
  @PlatformAdminOnly()
  @Post()
  async create(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateOrganizationDto,
  ) {
    const result = await this.organizationsService.create(auth, dto);
    const subscription = await this.subscriptions.setSubscription(
      auth,
      result.organization.id,
      { plan: dto.plan, status: 'ACTIVE' },
    );
    return { ...result, subscription };
  }

  @Get('current')
  current(@CurrentAuth() auth: AuthContext) {
    return this.organizationsService.getById(auth, auth.organizationId!);
  }

  @Get(':organizationId')
  getById(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
  ) {
    return this.organizationsService.getById(auth, organizationId);
  }

  @Roles('OWNER', 'ADMIN')
  @Get(':organizationId/members')
  members(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
  ) {
    return this.organizationsService.listMembers(auth, organizationId);
  }

  @Roles('OWNER', 'ADMIN')
  @Post(':organizationId/members')
  addMember(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() dto: CreateMemberDto,
  ) {
    return this.organizationsService.addMember(auth, organizationId, dto);
  }

  @Roles('OWNER', 'ADMIN')
  @Patch(':organizationId/members/:membershipId')
  updateMember(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.organizationsService.updateMember(
      auth,
      organizationId,
      membershipId,
      dto,
    );
  }
}
