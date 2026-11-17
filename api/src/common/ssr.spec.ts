import { injectRendered, safeJson } from './ssr';

const TEMPLATE = '<html><head><title>x</title></head><body><div id="root"></div></body></html>';

describe('injectRendered', () => {
  it('puts the rendered page in #root and the API data in window.__PRELOAD__', () => {
    const html = injectRendered(TEMPLATE, '<h1>Bonjour</h1>', { '/services': [{ id: 1 }] });
    expect(html).toContain('<div id="root"><h1>Bonjour</h1></div>');
    expect(html).toContain('window.__PRELOAD__={"/services":[{"id":1}]};');
    expect(html.indexOf('__PRELOAD__')).toBeLessThan(html.indexOf('</head>'));
  });

  it('leaves the template untouched when there is no #root to fill', () => {
    expect(injectRendered('<html></html>', '<p>x</p>', {})).toBe('<html></html>');
  });

  it('is not fooled by $ sequences in the rendered content', () => {
    const html = injectRendered(TEMPLATE, '<p>Prix $& 45 $1</p>', {});
    expect(html).toContain('<p>Prix $& 45 $1</p>');
  });
});

describe('safeJson', () => {
  it('can never close the script tag it is placed in', () => {
    const out = safeJson({ comment: '</script><script>alert(1)</script>' });
    expect(out).not.toContain('</script>');
    expect(JSON.parse(out).comment).toBe('</script><script>alert(1)</script>');
  });
});
