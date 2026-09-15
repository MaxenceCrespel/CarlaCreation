import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PageView } from '../../database/entities/page-view.entity';
import type { DeviceType, TrafficSource } from '../../database/entities/page-view.entity';

export type VisitorPeriod = 'w1' | 'm1' | 'm3';

const PERIOD_DAYS: Record<VisitorPeriod, number> = { w1: 7, m1: 30, m3: 90 };
const PERIOD_LABELS: Record<VisitorPeriod, string> = {
  w1: '7 derniers jours',
  m1: '30 derniers jours',
  m3: '3 derniers mois',
};

const PATH_LABELS: Record<string, string> = {
  '/': 'Accueil',
  '/services': 'Prestations',
  '/gallery': 'Galerie',
  '/booking': 'Réservation',
  '/contact': 'Contact',
  '/mon-rendez-vous': 'Gestion de rendez-vous',
};

const SOURCE_LABELS: Record<TrafficSource, string> = {
  search: 'Recherche Google',
  direct: 'Accès direct',
  social: 'Réseaux sociaux',
  other: 'Autres sites',
};

const DEVICE_LABELS: Record<DeviceType, string> = {
  mobile: 'Mobile',
  desktop: 'Ordinateur',
  tablet: 'Tablette',
};

// Every reservation under /mon-rendez-vous/:groupId has a distinct URL —
// bucket them together so they don't drown out the real pages in "Pages
// les plus vues".
export function normalizePath(path: string): string {
  if (path.startsWith('/mon-rendez-vous/')) return '/mon-rendez-vous';
  return path;
}

function pathLabel(path: string): string {
  return PATH_LABELS[path] || path;
}

export function classifySource(referrer: string | undefined, publicOrigin: string): TrafficSource {
  if (!referrer) return 'direct';
  let host: string;
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    return 'other';
  }
  let originHost = '';
  try {
    originHost = new URL(publicOrigin).hostname.toLowerCase();
  } catch {
    // PUBLIC_ORIGIN misconfigured — fall through, treat as external.
  }
  if (host === originHost) return 'direct';

  const searchEngines = ['google.', 'bing.com', 'duckduckgo.com', 'yahoo.', 'qwant.com', 'ecosia.org'];
  if (searchEngines.some((s) => host.includes(s))) return 'search';

  const social = ['facebook.com', 'instagram.com', 'tiktok.com', 'twitter.com', 'x.com', 'linkedin.com', 'pinterest.'];
  if (social.some((s) => host.includes(s))) return 'social';

  return 'other';
}

export function classifyDevice(userAgent: string | undefined): DeviceType {
  if (!userAgent) return 'desktop';
  const ua = userAgent.toLowerCase();
  if (/ipad|tablet|kindle|playbook|silk/.test(ua) && !/mobile/.test(ua)) return 'tablet';
  if (/mobi|iphone|ipod|android.*mobile|blackberry|opera mini|iemobile/.test(ua)) return 'mobile';
  return 'desktop';
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function pctChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return round1(((current - previous) / previous) * 100);
}

// Local calendar day, honouring process.env.TZ (set to Europe/Paris at
// startup — see config.ts) rather than UTC.
function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface RawRow {
  path: string;
  visitor_id: string;
  source: TrafficSource;
  device: DeviceType;
  created_at: Date;
}

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(PageView) private readonly pageViewRepo: Repository<PageView>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async record(path: string, visitorId: string, source: TrafficSource, device: DeviceType): Promise<void> {
    const view = this.pageViewRepo.create({ path: normalizePath(path), visitor_id: visitorId, source, device });
    await this.pageViewRepo.save(view);
  }

  async getStats(period: VisitorPeriod) {
    if (!PERIOD_DAYS[period]) {
      throw new BadRequestException('Période invalide.');
    }
    const days = PERIOD_DAYS[period];
    const to = new Date();
    const from = new Date(to.getTime() - days * 86_400_000);
    const prevTo = from;
    const prevFrom = new Date(from.getTime() - days * 86_400_000);

    const [currentRows, previousRows] = await Promise.all([this.fetchRows(from, to), this.fetchRows(prevFrom, prevTo)]);

    const current = this.aggregate(currentRows);
    const previous = this.aggregate(previousRows);

    return {
      period: { key: period, label: PERIOD_LABELS[period], from: from.toISOString(), to: to.toISOString() },
      kpis: {
        uniqueVisitors: current.uniqueVisitors,
        uniqueVisitorsDeltaPct: pctChange(current.uniqueVisitors, previous.uniqueVisitors),
        pageViews: current.pageViews,
        pageViewsDeltaPct: pctChange(current.pageViews, previous.pageViews),
        pagesPerVisit: current.pagesPerVisit,
        bounceRatePercent: current.bounceRatePercent,
        bounceRateDeltaPts:
          current.bounceRatePercent !== null && previous.bounceRatePercent !== null
            ? round1(current.bounceRatePercent - previous.bounceRatePercent)
            : null,
      },
      chart: this.buildChart(currentRows, period, to),
      topPages: current.topPages,
      sources: current.sources,
      devices: current.devices,
    };
  }

  private async fetchRows(from: Date, to: Date): Promise<RawRow[]> {
    return this.dataSource.query(
      `SELECT path, visitor_id, source, device, created_at FROM page_views WHERE created_at >= $1 AND created_at < $2`,
      [from.toISOString(), to.toISOString()],
    );
  }

  // A "visit"/session is (visitor, calendar day) — no in-app event stream
  // to derive real 30-minute sessions from, and for a small local-business
  // site a same-day revisit is already a reasonable proxy for "one visit".
  private aggregate(rows: RawRow[]) {
    const pageViews = rows.length;
    const uniqueVisitors = new Set(rows.map((r) => r.visitor_id)).size;

    const sessions = new Map<string, RawRow[]>();
    for (const r of rows) {
      const key = `${r.visitor_id}|${localDayKey(new Date(r.created_at))}`;
      const list = sessions.get(key);
      if (list) list.push(r);
      else sessions.set(key, [r]);
    }
    const sessionCount = sessions.size;

    let bounced = 0;
    const sourceCounts = new Map<TrafficSource, number>();
    const deviceCounts = new Map<DeviceType, number>();
    for (const sessionRows of sessions.values()) {
      if (sessionRows.length === 1) bounced += 1;
      // First event of the session decides its source/device — a referrer
      // only means anything on the way in.
      const first = sessionRows.reduce((a, b) => (new Date(a.created_at) <= new Date(b.created_at) ? a : b));
      sourceCounts.set(first.source, (sourceCounts.get(first.source) ?? 0) + 1);
      deviceCounts.set(first.device, (deviceCounts.get(first.device) ?? 0) + 1);
    }

    const pathCounts = new Map<string, number>();
    for (const r of rows) {
      pathCounts.set(r.path, (pathCounts.get(r.path) ?? 0) + 1);
    }
    const topPages = [...pathCounts.entries()]
      .map(([path, count]) => ({ path, label: pathLabel(path), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const sources = (Object.keys(SOURCE_LABELS) as TrafficSource[])
      .map((key) => ({ name: SOURCE_LABELS[key], pct: sessionCount > 0 ? round1(((sourceCounts.get(key) ?? 0) / sessionCount) * 100) : 0 }))
      .filter((s) => s.pct > 0);

    const devices = (Object.keys(DEVICE_LABELS) as DeviceType[])
      .map((key) => ({ name: DEVICE_LABELS[key], pct: sessionCount > 0 ? round1(((deviceCounts.get(key) ?? 0) / sessionCount) * 100) : 0 }))
      .filter((d) => d.pct > 0);

    return {
      uniqueVisitors,
      pageViews,
      pagesPerVisit: sessionCount > 0 ? round1(pageViews / sessionCount) : 0,
      bounceRatePercent: sessionCount > 0 ? round1((bounced / sessionCount) * 100) : null,
      topPages,
      sources,
      devices,
    };
  }

  // Chart counts visits (sessions), not raw page views — "Pages vues" above
  // already covers the raw count. Buckets are trailing 24h/7-day windows
  // ending "now", not calendar-aligned — simpler, and the exact edge of a
  // bucket doesn't matter for a trend chart.
  private buildChart(rows: RawRow[], period: VisitorPeriod, to: Date) {
    const sessionFirstSeen = new Map<string, Date>();
    for (const r of rows) {
      const created = new Date(r.created_at);
      const key = `${r.visitor_id}|${localDayKey(created)}`;
      const existing = sessionFirstSeen.get(key);
      if (!existing || created < existing) sessionFirstSeen.set(key, created);
    }

    if (period === 'm3') {
      const weeks = 13;
      const msPerWeek = 7 * 86_400_000;
      const rangeStart = new Date(to.getTime() - weeks * msPerWeek);
      const counts = new Array(weeks).fill(0);
      for (const created of sessionFirstSeen.values()) {
        // Clamp into the last bucket: `to` is "now", and a session recorded
        // in the same millisecond as `to` would otherwise land exactly one
        // bucket past the end (idx === weeks) and get silently dropped.
        const idx = Math.min(weeks - 1, Math.floor((created.getTime() - rangeStart.getTime()) / msPerWeek));
        if (idx >= 0) counts[idx] += 1;
      }
      return { unit: 'semaine' as const, counts };
    }

    const days = PERIOD_DAYS[period];
    const rangeStart = new Date(to.getTime() - days * 86_400_000);
    const counts = new Array(days).fill(0);
    for (const created of sessionFirstSeen.values()) {
      const idx = Math.min(days - 1, Math.floor((created.getTime() - rangeStart.getTime()) / 86_400_000));
      if (idx >= 0) counts[idx] += 1;
    }
    return { unit: 'jour' as const, counts };
  }
}
