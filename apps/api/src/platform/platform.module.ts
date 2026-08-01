// PHASE_8_TRUE_CONTROL_CENTER
import { Module } from '@nestjs/common';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';
import { PlatformTableLayoutService } from './platform-table-layout.service';

@Module({
  controllers: [PlatformController],
  providers: [PlatformService, PlatformTableLayoutService],
})
export class PlatformModule {}
