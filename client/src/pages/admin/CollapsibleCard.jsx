import { useState } from 'react';

// Wraps a secondary/rarely-touched settings block (e.g. a fallback that
// only matters when some primary automated mechanism is unavailable) so it
// stays out of the way by default instead of competing for attention with
// the tab's main content. Collapsed unless the admin deliberately opens it
// — nothing inside is ever hidden data, just deferred rendering.
export default function CollapsibleCard({ title, hint, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="collapsible-card">
      <button type="button" className="collapsible-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="collapsible-toggle-title">{title}</span>
        <span className="collapsible-toggle-chevron">{open ? '▲' : '▼'}</span>
      </button>
      {!open && hint && <p className="collapsible-toggle-hint">{hint}</p>}
      {open && <div className="collapsible-card-body">{children}</div>}
    </div>
  );
}
