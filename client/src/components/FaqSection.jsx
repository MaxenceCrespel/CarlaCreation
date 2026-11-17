// Visible FAQ (native <details>) with its schema.org FAQPage markup, written
// directly in the HTML (microdata) so it is already in the page prerendered by
// the server — no script to inject.
export default function FaqSection({ faq, title = 'Questions fréquentes', id = 'faq' }) {
  return (
    <div className="card" id={id} itemScope itemType="https://schema.org/FAQPage">
      <h2>{title}</h2>
      <div className="faq-list">
        {faq.map(({ q, a }) => (
          <details key={q} className="faq-item" itemProp="mainEntity" itemScope itemType="https://schema.org/Question">
            <summary itemProp="name">{q}</summary>
            <div itemProp="acceptedAnswer" itemScope itemType="https://schema.org/Answer">
              <p itemProp="text">{a}</p>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
