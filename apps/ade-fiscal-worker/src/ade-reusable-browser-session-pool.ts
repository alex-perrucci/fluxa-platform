import type { BrowserContext, Page } from 'playwright';

interface ReusableSessionEntry {
  fingerprint: string;
  context: BrowserContext;
  page: Page;
}

export interface ReusableSessionFactoryResult {
  context: BrowserContext;
  page: Page;
}

export class AdeReusableBrowserSessionPool {
  private readonly entries = new Map<string, ReusableSessionEntry>();

  constructor(private readonly maxEntries: number) {}

  get size(): number {
    return this.entries.size;
  }

  async getPage(input: {
    key: string;
    fingerprint: string;
    create: () => Promise<ReusableSessionFactoryResult>;
    onPage?: (page: Page) => void;
  }): Promise<Page> {
    const existing = this.entries.get(input.key);

    if (existing && existing.fingerprint !== input.fingerprint) {
      await this.reset(input.key);
    } else if (existing) {
      if (!existing.page.isClosed()) {
        this.touch(input.key, existing);
        return existing.page;
      }

      try {
        const page = await existing.context.newPage();
        input.onPage?.(page);
        const refreshed = { ...existing, page };
        this.touch(input.key, refreshed);
        return page;
      } catch {
        await this.reset(input.key);
      }
    }

    const created = await input.create();
    input.onPage?.(created.page);
    this.entries.set(input.key, {
      fingerprint: input.fingerprint,
      context: created.context,
      page: created.page,
    });
    await this.evictOverflow(input.key);
    return created.page;
  }

  async reset(key?: string): Promise<void> {
    if (key != null) {
      const entry = this.entries.get(key);
      if (!entry) return;
      this.entries.delete(key);
      await this.closeEntry(entry);
      return;
    }

    const entries = [...this.entries.values()];
    this.entries.clear();
    await Promise.all(entries.map((entry) => this.closeEntry(entry)));
  }

  private touch(key: string, entry: ReusableSessionEntry): void {
    this.entries.delete(key);
    this.entries.set(key, entry);
  }

  private async evictOverflow(currentKey: string): Promise<void> {
    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value as string | undefined;
      if (!oldestKey) return;
      if (oldestKey === currentKey && this.entries.size === 1) return;
      await this.reset(oldestKey);
    }
  }

  private async closeEntry(entry: ReusableSessionEntry): Promise<void> {
    await entry.page.close().catch(() => undefined);
    await entry.context.close().catch(() => undefined);
  }
}
