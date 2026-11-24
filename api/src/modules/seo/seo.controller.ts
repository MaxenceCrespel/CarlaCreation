import { Controller, Get, Header } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { DataSource } from 'typeorm';
import { CLIENT_DIST } from '../../common/client-dist';
import { config } from '../../config';
import { INDEXNOW_KEY } from './indexnow';
import { ContentSource, PUBLIC_PAGES } from './public-pages';

// Date du build du site (index.html), donc du dernier déploiement.
function buildDate(): Date | null {
  try {
    return fs.statSync(path.join(CLIENT_DIST, 'index.html')).mtime;
  } catch {
    return null;
  }
}

const day = (d: Date) => d.toISOString().slice(0, 10);

@Controller()
export class SeoController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Get('robots.txt')
  @Header('Content-Type', 'text/plain')
  robots(): string {
    return ['User-agent: *', 'Allow: /', 'Disallow: /admin', '', `Sitemap: ${config.PUBLIC_ORIGIN}/sitemap.xml`, ''].join('\n');
  }

  // Fichier de clé IndexNow : prouve à Bing que les signalements viennent du site.
  @Get(`${INDEXNOW_KEY}.txt`)
  @Header('Content-Type', 'text/plain')
  indexNowKey(): string {
    return INDEXNOW_KEY;
  }

  // Dates les plus récentes des contenus de la base affichés sur les pages.
  private async contentDates(): Promise<Record<ContentSource, Date | null>> {
    try {
      const [row]: { gallery: Date | null; reviews: Date | null }[] = await this.dataSource.query(
        `SELECT (SELECT MAX(created_at) FROM gallery) AS gallery,
                (SELECT MAX(created_at) FROM reviews WHERE status = 'approved') AS reviews`,
      );
      return { gallery: row?.gallery ? new Date(row.gallery) : null, reviews: row?.reviews ? new Date(row.reviews) : null };
    } catch {
      return { gallery: null, reviews: null };
    }
  }

  // <lastmod> = date du dernier déploiement, ou plus récente si une photo ou
  // un avis affiché sur la page a été ajouté depuis. Google ignore
  // changefreq/priority mais se sert de lastmod pour décider quand repasser.
  @Get('sitemap.xml')
  @Header('Content-Type', 'application/xml')
  async sitemap(): Promise<string> {
    const built = buildDate();
    const content = await this.contentDates();
    const urls = PUBLIC_PAGES.map((p) => {
      const dates = [built, ...p.sources.map((s) => content[s])].filter((d): d is Date => d !== null);
      const lastmod = dates.length ? `\n    <lastmod>${day(new Date(Math.max(...dates.map((d) => d.getTime()))))}</lastmod>` : '';
      return `  <url>\n    <loc>${config.PUBLIC_ORIGIN}${p.path}</loc>${lastmod}\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`;
    }).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  }
}
