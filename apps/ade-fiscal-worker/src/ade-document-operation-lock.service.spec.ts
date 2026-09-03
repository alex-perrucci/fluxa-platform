import { AdeDocumentOperationLockService } from './ade-document-operation-lock.service';

describe('AdeDocumentOperationLockService', () => {
  it('serializes the same fiscal id but allows different fiscal ids', () => {
    const locks = new AdeDocumentOperationLockService();

    const releaseA = locks.tryAcquire('03154790343');
    const releaseB = locks.tryAcquire('03053300343');

    expect(releaseA).not.toBeNull();
    expect(releaseB).not.toBeNull();
    expect(locks.tryAcquire('03154790343')).toBeNull();
    expect(locks.tryAcquire('03053300343')).toBeNull();

    releaseA?.();
    expect(locks.tryAcquire('03154790343')).not.toBeNull();

    releaseB?.();
  });

  it('release is idempotent', () => {
    const locks = new AdeDocumentOperationLockService();
    const release = locks.tryAcquire('03154790343');

    release?.();
    release?.();

    expect(locks.tryAcquire('03154790343')).not.toBeNull();
  });
});
