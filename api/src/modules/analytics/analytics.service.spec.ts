import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { AnalyticsService, classifyDevice, classifySource, normalizePath } from './analytics.service';
import { PageView } from '../../database/entities/page-view.entity';

describe('classifySource', () => {
  const origin = 'https://staging.carlacreation.fr';

  it('treats no referrer as direct', () => {
    expect(classifySource(undefined, origin)).toBe('direct');
  });

  it('treats a same-origin referrer as direct', () => {
    expect(classifySource('https://staging.carlacreation.fr/booking', origin)).toBe('direct');
  });

  it('recognises search engines', () => {
    expect(classifySource('https://www.google.com/search?q=coiffeuse', origin)).toBe('search');
    expect(classifySource('https://www.bing.com/search?q=x', origin)).toBe('search');
  });

  it('recognises social networks', () => {
    expect(classifySource('https://www.instagram.com/', origin)).toBe('social');
    expect(classifySource('https://l.facebook.com/l.php', origin)).toBe('social');
  });

  it('falls back to other for anything else external', () => {
    expect(classifySource('https://some-blog.example/article', origin)).toBe('other');
  });

  it('falls back to other for a malformed referrer', () => {
    expect(classifySource('not a url', origin)).toBe('other');
  });
});

describe('classifyDevice', () => {
  it('recognises a mobile user agent', () => {
    expect(classifyDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15')).toBe('mobile');
    expect(classifyDevice('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Mobile')).toBe('mobile');
  });

  it('recognises a tablet user agent', () => {
    expect(classifyDevice('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15')).toBe('tablet');
  });

  it('defaults to desktop', () => {
    expect(classifyDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')).toBe('desktop');
    expect(classifyDevice(undefined)).toBe('desktop');
  });
});

describe('normalizePath', () => {
  it('collapses per-reservation management URLs to one bucket', () => {
    expect(normalizePath('/mon-rendez-vous/abc-123')).toBe('/mon-rendez-vous');
  });

  it('leaves other paths untouched', () => {
    expect(normalizePath('/services')).toBe('/services');
  });
});

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let repo: { create: jest.Mock; save: jest.Mock };
  let dataSource: { query: jest.Mock };

  beforeEach(async () => {
    repo = { create: jest.fn((v) => v), save: jest.fn((v) => Promise.resolve(v)) };
    dataSource = { query: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: getRepositoryToken(PageView), useValue: repo },
        { provide: getDataSourceToken(), useValue: dataSource },
      ],
    }).compile();

    service = module.get(AnalyticsService);
  });

  it('record() normalizes the path and saves a row', async () => {
    await service.record('/mon-rendez-vous/xyz', 'visitor-1', 'direct', 'mobile');

    expect(repo.create).toHaveBeenCalledWith({
      path: '/mon-rendez-vous',
      visitor_id: 'visitor-1',
      source: 'direct',
      device: 'mobile',
    });
    expect(repo.save).toHaveBeenCalled();
  });

  it('rejects an invalid period', async () => {
    await expect(service.getStats('bogus' as any)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('aggregates unique visitors, page views and bounce rate from raw rows', async () => {
    const now = new Date();
    // visitor-a: two page views same day -> not a bounce.
    // visitor-b: one page view -> a bounce.
    const rows = [
      { path: '/', visitor_id: 'a', source: 'direct', device: 'mobile', created_at: now },
      { path: '/services', visitor_id: 'a', source: 'direct', device: 'mobile', created_at: now },
      { path: '/', visitor_id: 'b', source: 'search', device: 'desktop', created_at: now },
    ];
    dataSource.query.mockResolvedValueOnce(rows).mockResolvedValueOnce([]);

    const stats = await service.getStats('w1');

    expect(stats.kpis.uniqueVisitors).toBe(2);
    expect(stats.kpis.pageViews).toBe(3);
    // 2 sessions total, 1 bounced (visitor b) -> 50%.
    expect(stats.kpis.bounceRatePercent).toBe(50);
    expect(stats.kpis.pagesPerVisit).toBe(1.5);
    expect(stats.topPages).toEqual(
      expect.arrayContaining([
        { path: '/', label: 'Accueil', count: 2 },
        { path: '/services', label: 'Prestations', count: 1 },
      ]),
    );
  });

  it('returns a null bounce rate and delta when there is no traffic at all', async () => {
    dataSource.query.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const stats = await service.getStats('m1');

    expect(stats.kpis.bounceRatePercent).toBeNull();
    expect(stats.kpis.bounceRateDeltaPts).toBeNull();
    expect(stats.kpis.uniqueVisitorsDeltaPct).toBeNull();
  });

  it('computes a percentage delta against the previous period', async () => {
    const now = new Date();
    const currentRows = [{ path: '/', visitor_id: 'a', source: 'direct', device: 'mobile', created_at: now }];
    const previousRows = [
      { path: '/', visitor_id: 'x', source: 'direct', device: 'mobile', created_at: now },
      { path: '/', visitor_id: 'y', source: 'direct', device: 'mobile', created_at: now },
    ];
    dataSource.query.mockResolvedValueOnce(currentRows).mockResolvedValueOnce(previousRows);

    const stats = await service.getStats('w1');

    // 1 unique now vs 2 previously -> -50%.
    expect(stats.kpis.uniqueVisitorsDeltaPct).toBe(-50);
  });

  it('builds a daily chart with one bucket per day for a 7-day period', async () => {
    const now = new Date();
    dataSource.query.mockResolvedValueOnce([{ path: '/', visitor_id: 'a', source: 'direct', device: 'mobile', created_at: now }]).mockResolvedValueOnce([]);

    const stats = await service.getStats('w1');

    expect(stats.chart.unit).toBe('jour');
    expect(stats.chart.counts).toHaveLength(7);
    expect(stats.chart.counts.reduce((a: number, b: number) => a + b, 0)).toBe(1);
  });

  it('builds a weekly chart for the 3-month period', async () => {
    dataSource.query.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const stats = await service.getStats('m3');

    expect(stats.chart.unit).toBe('semaine');
    expect(stats.chart.counts).toHaveLength(13);
  });
});
