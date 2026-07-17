import { Controller, Get, Header } from '@nestjs/common';
import { config } from '../../config';

const PUBLIC_PAGES = [
  { path: '/', priority: '1.0', changefreq: 'weekly' },
  { path: '/services', priority: '0.8', changefreq: 'weekly' },
  { path: '/gallery', priority: '0.6', changefreq: 'weekly' },
  { path: '/booking', priority: '0.9', changefreq: 'weekly' },
  { path: '/contact', priority: '0.5', changefreq: 'monthly' },
];

@Controller()
export class SeoController {
  @Get('robots.txt')
  @Header('Content-Type', 'text/plain')
  robots(): string {
    return ['User-agent: *', 'Allow: /', 'Disallow: /admin', '', `Sitemap: ${config.PUBLIC_ORIGIN}/sitemap.xml`, ''].join('\n');
  }

  @Get('sitemap.xml')
  @Header('Content-Type', 'application/xml')
  sitemap(): string {
    const urls = PUBLIC_PAGES.map(
      (p) => `  <url>\n    <loc>${config.PUBLIC_ORIGIN}${p.path}</loc>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`,
    ).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  }
}
