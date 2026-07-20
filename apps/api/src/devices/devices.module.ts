import { Module } from '@nestjs/common';
import { CurrentDeviceAssignmentService } from './current-device-assignment.service';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';

@Module({
  controllers: [DevicesController],
  providers: [DevicesService, CurrentDeviceAssignmentService],
})
export class DevicesModule {}
