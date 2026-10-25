import { useEffect } from 'react';

// Visible FAQ (native <details>) + the matching FAQPage structured data,
// injected while the page is mounted and removed on leave.
export default function FaqSection({ faq, title = 'Questions fréquentes', id = 'faq' }) {
  useEffect(() => {
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.dataset.seo = 'faq';
    script.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faq.map(({ q, a }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
    });
    document.head.appendChild(script);
    return () => script.remove();
  }, [faq]);

  return (
    <div className="card" id={id}>
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
