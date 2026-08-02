import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PublishFloorPlanDto } from './dto/publish-floor-plan.dto';
import { SaveFloorPlanDraftDto } from './dto/save-floor-plan-draft.dto';
import { FloorPlansService } from './floor-plans.service';

@Roles('OWNER', 'ADMIN', 'MANAGER')
@Controller('floor-plans')
export class FloorPlansController {
  constructor(private readonly floorPlans: FloorPlansService) {}

  @Get(':locationId')
  get(
    @CurrentAuth() auth: AuthContext,
    @Param('locationId', ParseUUIDPipe) locationId: string,
  ) {
    return this.floorPlans.get(auth, locationId);
  }

  @Put(':locationId/draft')
  saveDraft(
    @CurrentAuth() auth: AuthContext,
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: SaveFloorPlanDraftDto,
  ) {
    return this.floorPlans.saveDraft(auth, locationId, dto);
  }

  @Put(':locationId/publish')
  publish(
    @CurrentAuth() auth: AuthContext,
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: PublishFloorPlanDto,
  ) {
    return this.floorPlans.publish(auth, locationId, dto);
  }
}
