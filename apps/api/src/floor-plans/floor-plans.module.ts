import { Module } from '@nestjs/common';
import { FloorPlanLocationsService } from './floor-plan-locations.service';
import { FloorPlansController } from './floor-plans.controller';
import { FloorPlansService } from './floor-plans.service';

@Module({
  controllers: [FloorPlansController],
  providers: [FloorPlansService, FloorPlanLocationsService],
  exports: [FloorPlansService],
})
export class FloorPlansModule {}
