// PHASE_8_TRUE_CONTROL_CENTER
import { Module } from '@nestjs/common';
import { FloorPlansModule } from '../floor-plans/floor-plans.module';
import { PlatformController } from './platform.controller';
import { PlatformLocationAccessService } from './platform-location-access.service';
import { PlatformLocationsService } from './platform-locations.service';
import { PlatformService } from './platform.service';
import { PlatformTableLayoutService } from './platform-table-layout.service';

@Module({
  imports: [FloorPlansModule],
  controllers: [PlatformController],
  providers: [
    PlatformService,
    PlatformTableLayoutService,
    PlatformLocationsService,
    PlatformLocationAccessService,
  ],
})
export class PlatformModule {}
