import { SeoController } from './seo.controller';

describe('SeoController', () => {
  const controller = new SeoController();

  it('disallows /admin from crawling and points to the sitemap', () => {
    const robots = controller.robots();
    expect(robots).toContain('Disallow: /admin');
    expect(robots).toContain('Sitemap:');
    expect(robots).toContain('/sitemap.xml');
  });

  it('lists every public page in the sitemap, and never /admin', () => {
    const sitemap = controller.sitemap();
    expect(sitemap).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    for (const path of ['/', '/services', '/gallery', '/booking', '/contact']) {
      expect(sitemap).toMatch(new RegExp(`<loc>[^<]*${path.replace('/', '\\/')}</loc>`));
    }
    expect((sitemap.match(/<url>/g) || []).length).toBe(5);
    expect(sitemap).not.toContain('/admin');
  });
});
