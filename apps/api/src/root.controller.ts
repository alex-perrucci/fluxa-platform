import { Controller, Get } from '@nestjs/common';

@Controller()
export class RootController {
  @Get()
  getRoot() {
    return {
      service: 'Fluxa API',
      version: '0.1.0',
      status: 'running',
      timestamp: new Date().toISOString(),
    };
  }
}
