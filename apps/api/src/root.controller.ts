import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/decorators/public.decorator';

@Public()
@Controller()
export class RootController {
  @Get()
  getRoot() {
    return {
      service: 'Fluxa API',
      version: '0.2.0',
      status: 'running',
      timestamp: new Date().toISOString(),
    };
  }
}
