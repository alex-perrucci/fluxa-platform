import { Injectable } from '@nestjs/common';

export type AdeDocumentOperationRelease = () => void;

@Injectable()
export class AdeDocumentOperationLockService {
  private readonly busyKeys = new Set<string>();

  tryAcquire(key = '__global__'): AdeDocumentOperationRelease | null {
    if (this.busyKeys.has(key)) return null;
    this.busyKeys.add(key);

    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.busyKeys.delete(key);
    };
  }
}
