import { Injectable } from '@nestjs/common';

export interface AdeWorkerReadiness {
  service: 'ok';
  phase: 'foundation';
  browser: 'not_configured';
  adeSession: 'not_configured';
  operational: false;
}

@Injectable()
export class AdeWebFiscalService {
  readiness(): AdeWorkerReadiness {
    return {
      service: 'ok',
      phase: 'foundation',
      browser: 'not_configured',
      adeSession: 'not_configured',
      operational: false,
    };
  }
}
