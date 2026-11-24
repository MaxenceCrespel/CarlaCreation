import { DataSource } from 'typeorm';
import { INDEXNOW_KEY } from './indexnow';
import { SeoController } from './seo.controller';

const dataSourceReturning = (rows: unknown) => ({ query: jest.fn().mockResolvedValue(rows) }) as unknown as DataSource;

const lastmodOf = (sitemap: string, path: string): string | undefined => {
  const block = sitemap.split('<url>').find((b) => b.includes(`${path}</loc>`));
  return block?.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1];
};

describe('SeoController', () => {
  const controller = new SeoController(dataSourceReturning([{ gallery: null, reviews: null }]));

  it('disallows /admin from crawling and points to the sitemap', () => {
    const robots = controller.robots();
    expect(robots).toContain('Disallow: /admin');
    expect(robots).toContain('Sitemap:');
    expect(robots).toContain('/sitemap.xml');
  });

  it('lists every public page in the sitemap, and never /admin', async () => {
    const sitemap = await controller.sitemap();
    expect(sitemap).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    for (const path of ['/', '/services', '/gallery', '/booking', '/coiffeuse-a-domicile', '/a-propos', '/contact']) {
      expect(sitemap).toMatch(new RegExp(`<loc>[^<]*${path.replace('/', '\\/')}</loc>`));
    }
    expect((sitemap.match(/<url>/g) || []).length).toBe(7);
    expect(sitemap).not.toContain('/admin');
  });

  it('dates the gallery and home pages from their newest photo or review', async () => {
    const future = new Date(Date.now() + 365 * 86400_000);
    const futureReview = new Date(Date.now() + 2 * 365 * 86400_000);
    const sitemap = await new SeoController(dataSourceReturning([{ gallery: future, reviews: futureReview }])).sitemap();
    expect(lastmodOf(sitemap, '/gallery')).toBe(future.toISOString().slice(0, 10));
    expect(lastmodOf(sitemap, '/')).toBe(futureReview.toISOString().slice(0, 10));
    expect(lastmodOf(sitemap, '/contact')).not.toBe(future.toISOString().slice(0, 10));
  });

  it('still serves the sitemap if the database is unavailable', async () => {
    const failing = { query: jest.fn().mockRejectedValue(new Error('down')) } as unknown as DataSource;
    const sitemap = await new SeoController(failing).sitemap();
    expect((sitemap.match(/<url>/g) || []).length).toBe(7);
  });

  it('serves the IndexNow key file', () => {
    expect(controller.indexNowKey()).toBe(INDEXNOW_KEY);
  });
});
