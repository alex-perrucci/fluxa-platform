import type { BrowserContext, Page } from 'playwright';
import { AdeReusableBrowserSessionPool } from './ade-reusable-browser-session-pool';

function fakeSession() {
  const pageClose = jest.fn().mockResolvedValue(undefined);
  const contextClose = jest.fn().mockResolvedValue(undefined);
  const page = {
    isClosed: jest.fn().mockReturnValue(false),
    close: pageClose,
  } as unknown as Page;
  const context = {
    newPage: jest.fn(),
    close: contextClose,
  } as unknown as BrowserContext;
  return { context, page, pageClose, contextClose };
}

describe('AdeReusableBrowserSessionPool', () => {
  it('reuses a live page for the same key and fingerprint', async () => {
    const pool = new AdeReusableBrowserSessionPool(8);
    const first = fakeSession();
    const create = jest.fn().mockResolvedValue(first);

    const page1 = await pool.getPage({ key: 'a', fingerprint: 'v1', create });
    const page2 = await pool.getPage({ key: 'a', fingerprint: 'v1', create });

    expect(page2).toBe(page1);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('replaces only the matching session when its fingerprint changes', async () => {
    const pool = new AdeReusableBrowserSessionPool(8);
    const first = fakeSession();
    const second = fakeSession();
    const other = fakeSession();

    await pool.getPage({
      key: 'a',
      fingerprint: 'v1',
      create: jest.fn().mockResolvedValue(first),
    });
    await pool.getPage({
      key: 'b',
      fingerprint: 'v1',
      create: jest.fn().mockResolvedValue(other),
    });
    await pool.getPage({
      key: 'a',
      fingerprint: 'v2',
      create: jest.fn().mockResolvedValue(second),
    });

    expect(first.pageClose).toHaveBeenCalledTimes(1);
    expect(first.contextClose).toHaveBeenCalledTimes(1);
    expect(other.pageClose).not.toHaveBeenCalled();
    expect(pool.size).toBe(2);
  });

  it('evicts the least recently used session when capacity is exceeded', async () => {
    const pool = new AdeReusableBrowserSessionPool(2);
    const first = fakeSession();
    const second = fakeSession();
    const third = fakeSession();

    await pool.getPage({
      key: 'a',
      fingerprint: 'v1',
      create: jest.fn().mockResolvedValue(first),
    });
    await pool.getPage({
      key: 'b',
      fingerprint: 'v1',
      create: jest.fn().mockResolvedValue(second),
    });
    await pool.getPage({
      key: 'a',
      fingerprint: 'v1',
      create: jest.fn(),
    });
    await pool.getPage({
      key: 'c',
      fingerprint: 'v1',
      create: jest.fn().mockResolvedValue(third),
    });

    expect(second.pageClose).toHaveBeenCalledTimes(1);
    expect(first.pageClose).not.toHaveBeenCalled();
    expect(pool.size).toBe(2);
  });
});
