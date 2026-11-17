import { isUnknownRoute, renderSeoHtml } from './seo-meta';

const TEMPLATE = `<!doctype html><html><head>
<title>Accueil</title>
<meta name="description" content="Desc accueil" />
<meta name="robots" content="index, follow" />
<meta property="og:title" content="Accueil" />
<meta property="og:description" content="Desc accueil" />
</head><body><div id="root"></div></body></html>`;

describe('renderSeoHtml', () => {
  it('gives a public page its own title, description and canonical', () => {
    const html = renderSeoHtml(TEMPLATE, '/coiffeuse-a-domicile')!;
    expect(html).toContain('<title>Coiffeuse à domicile à Loos, Lille et alentours | Carla Création</title>');
    expect(html).toContain('content="Coiffeuse à domicile à Loos, Lille, Ronchin');
    expect(html).toMatch(/<link rel="canonical" href="[^"]*\/coiffeuse-a-domicile" \/>/);
    expect(html).toContain('index, follow');
  });

  it('serves the local-business data in the HTML, with the Google profile and Instagram, but no address', () => {
    const html = renderSeoHtml(TEMPLATE, '/')!;
    const match = html.match(/<script type="application\/ld\+json" data-seo="local-business">(.*?)<\/script>/s);
    expect(match).not.toBeNull();
    const data = JSON.parse(match![1]);
    expect(data['@type']).toEqual(['HairSalon', 'NailSalon']);
    expect(data.sameAs).toEqual(expect.arrayContaining(['https://maps.app.goo.gl/HUwixfRkZNx12YRP7', 'https://www.instagram.com/creationbycarla/']));
    expect(data).not.toHaveProperty('address');
    expect(data).not.toHaveProperty('geo');
    expect(match![1]).not.toContain('Clemenceau');
  });

  it('does not put the local-business data on private pages', () => {
    expect(renderSeoHtml(TEMPLATE, '/mon-compte')).not.toContain('ld+json');
  });

  it('escapes quotes so a title can never break the markup', () => {
    const html = renderSeoHtml(TEMPLATE, '/services')!;
    expect(html).toContain("pose d'ongles");
    expect(html).not.toContain('content="Tous mes tarifs"extra');
  });

  it('marks private pages noindex', () => {
    for (const p of ['/mon-compte', '/mon-rendez-vous/abc-123', '/verification-email', '/mot-de-passe-oublie']) {
      expect(renderSeoHtml(TEMPLATE, p)).toContain('noindex, nofollow');
    }
  });

  it('leaves unknown routes and the admin to the default handling', () => {
    expect(renderSeoHtml(TEMPLATE, '/admin')).toBeNull();
    expect(renderSeoHtml(TEMPLATE, '/une-page-inconnue')).toBeNull();
  });

  it('flags only genuinely unknown pages as 404', () => {
    expect(isUnknownRoute('/une-page-inconnue')).toBe(true);
    expect(isUnknownRoute('/services/truc')).toBe(true);
    for (const p of ['/', '/services', '/admin', '/cgv', '/mon-rendez-vous/abc', '/api/services', '/uploads/x', '/healthz', '/favicon.svg', '/assets/index-abc.js']) {
      expect(isUnknownRoute(p)).toBe(false);
    }
  });
});
