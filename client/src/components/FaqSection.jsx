// Visible FAQ (native <details>) + the matching FAQPage structured data,
// rendered inline so it is also present in the HTML the server prerenders.
export default function FaqSection({ faq, title = 'Questions fréquentes', id = 'faq' }) {
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map(({ q, a }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  }).replace(/</g, '\\u003c');

  return (
    <div className="card" id={id}>
      <script type="application/ld+json" data-seo="faq" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <h2>{title}</h2>
      <div className="faq-list">
        {faq.map(({ q, a }) => (
          <details key={q} className="faq-item">
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
