import { Controller, Get } from '@nestjs/common';
import { AdeWebFiscalService } from './ade-web-fiscal.service';

@Controller()
export class AdeHealthController {
  constructor(private readonly ade: AdeWebFiscalService) {}

  @Get('health')
  health() {
    return this.ade.readiness();
  }
}
