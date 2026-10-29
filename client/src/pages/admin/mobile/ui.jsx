import { useEffect, useId, useRef } from 'react';

// Small building blocks shared by every phone admin screen: icons, the top
// bar, the bottom sheet, switches, segmented controls and filter chips.

const ICON_PATHS = {
  home: 'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z',
  calendar: 'M4 5h16v16H4zM4 9h16M8 3v4M16 3v4',
  users: 'M16 19v-1a4 4 0 0 0-8 0v1M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  menu: 'M4 7h16M4 12h16M4 17h16',
  phone: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z',
  sms: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  mail: 'M3 5h18v14H3zM3 7l9 6 9-6',
  navigate: 'm3 11 19-9-9 19-2-8-8-2z',
  pin: 'M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0zM12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  back: 'm15 18-6-6 6-6',
  next: 'm9 18 6-6-6-6',
  close: 'M18 6 6 18M6 6l12 12',
  copy: 'M8 8h13v13H8zM16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3',
  trash: 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14',
  plus: 'M12 5v14M5 12h14',
  calendarPlus: 'M4 5h16v16H4zM4 9h16M8 3v4M16 3v4M12 12v6M9 15h6',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.5-3.5',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
};

export function Icon({ name, size = 22 }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="m-icon"
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

// Back link ("‹ Plus"), big title, optional action on the right and
// optional content under the title (filters, segmented control…).
export function TopBar({ title, back, action, subtitle, children }) {
  return (
    <header className="m-topbar">
      {(back || action) && (
        <div className="m-topbar-row">
          {back ? (
            <button type="button" className="m-link m-back" onClick={back.onClick}>
              <Icon name="back" size={22} />
              {back.label}
            </button>
          ) : (
            <span />
          )}
          {action && (
            <button type="button" className="m-link" onClick={action.onClick} disabled={action.disabled}>
              {action.label}
            </button>
          )}
        </div>
      )}
      {title && <h1 className="m-title">{title}</h1>}
      {subtitle && <p className="m-subtitle">{subtitle}</p>}
      {children}
    </header>
  );
}

// Body scroll is locked while at least one sheet is open — a counter so
// stacked sheets don't unlock it too early when the top one closes.
let openSheets = 0;

// Panel that slides up from the bottom of the screen. `title` sits between
// an optional left button (usually "Annuler") and right button
// ("Enregistrer"); without them a round close button is shown.
export function Sheet({ title, onClose, left, right, children, footer, tall = false }) {
  const panelRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    openSheets += 1;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      openSheets -= 1;
      if (openSheets === 0) document.body.style.overflow = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="m-sheet-layer">
      <div className="m-sheet-backdrop" onClick={onClose} />
      <section
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`m-sheet ${tall ? 'is-tall' : ''}`}
      >
        <span className="m-sheet-handle" aria-hidden="true" />
        <div className="m-sheet-head">
          {left ? (
            <button type="button" className="m-link" onClick={left.onClick} disabled={left.disabled}>{left.label}</button>
          ) : (
            <span className="m-sheet-spacer" />
          )}
          <h2 id={titleId} className="m-sheet-title">{title}</h2>
          {right ? (
            <button type="button" className="m-link m-link-strong" onClick={right.onClick} disabled={right.disabled}>{right.label}</button>
          ) : left ? (
            <span className="m-sheet-spacer" />
          ) : (
            <button type="button" className="m-round-btn" aria-label="Fermer" onClick={onClose}>
              <Icon name="close" size={18} />
            </button>
          )}
        </div>
        <div className="m-sheet-body">{children}</div>
        {footer && <div className="m-sheet-footer">{footer}</div>}
      </section>
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`m-switch ${checked ? 'is-on' : ''}`}
      onClick={() => onChange(!checked)}
    />
  );
}

export function Segmented({ options, value, onChange, label }) {
  return (
    <div className="m-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          className={value === o.value ? 'is-on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chips({ options, value, onChange, label }) {
  return (
    <div className="m-chips" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          className={`m-chip ${value === o.value ? 'is-on' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
          {o.count != null && <span className="m-chip-count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Badge({ tone = 'neutral', children }) {
  return <span className={`m-badge m-badge-${tone}`}>{children}</span>;
}

export function Fab({ label, onClick }) {
  return (
    <button type="button" className="m-fab" aria-label={label} onClick={onClick}>
      <Icon name="plus" size={28} />
    </button>
  );
}

export function Loading() {
  return <p className="m-empty">Chargement…</p>;
}

export function ErrorText({ children }) {
  return <p className="m-empty m-error">Erreur : {children}</p>;
}

export function Empty({ children }) {
  return <p className="m-empty">{children}</p>;
}

// Search field with a magnifier icon, used on the lists.
export function SearchField({ id, value, onChange, placeholder, label }) {
  return (
    <div className="m-search">
      <label htmlFor={id} className="m-visually-hidden">{label}</label>
      <Icon name="search" size={18} />
      <input id={id} type="search" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
