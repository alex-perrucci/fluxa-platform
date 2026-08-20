import { Injectable } from '@nestjs/common';

export type AdeDocumentOperationRelease = () => void;

@Injectable()
export class AdeDocumentOperationLockService {
  private busy = false;

  tryAcquire(): AdeDocumentOperationRelease | null {
    if (this.busy) return null;
    this.busy = true;

    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.busy = false;
    };
  }
}
