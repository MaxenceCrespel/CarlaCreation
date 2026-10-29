import { useEffect, useRef, useState } from 'react';
import '../styles/messages.css';

// Conversation between a client account and the salon, shared by « Mon
// compte » (me = 'client') and the phone admin (me = 'admin'): bubbles
// grouped by day, photos, the appointment a message is about, and a
// composer with an optional photo.

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

function dayKey(d) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(d) {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(d) === dayKey(today)) return "Aujourd'hui";
  if (dayKey(d) === dayKey(yesterday)) return 'Hier';
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() !== today.getFullYear() ? ` ${d.getFullYear()}` : ''}`;
}

function reservationLabel(r) {
  const [y, m, d] = r.date.split('-').map(Number);
  return `Rendez-vous du ${d} ${MONTHS[m - 1]}${y !== new Date().getFullYear() ? ` ${y}` : ''} · ${r.serviceName}`;
}

export function Composer({ onSend, disabled, placeholder, context, onClearContext }) {
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState(null);
  const [sending, setSending] = useState(false);
  const fileRef = useRef(null);
  const textRef = useRef(null);

  useEffect(() => {
    if (!photo) {
      setPreview(null);
      return undefined;
    }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  // Grows with the text, up to ~5 lines.
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [text]);

  async function send(e) {
    e.preventDefault();
    if (sending || (!text.trim() && !photo)) return;
    setSending(true);
    const ok = await onSend({ body: text.trim(), photo });
    setSending(false);
    if (ok) {
      setText('');
      setPhoto(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <form className="msg-composer" onSubmit={send}>
      {context && (
        <div className="msg-composer-context">
          <span>{context}</span>
          <button type="button" aria-label="Ne plus lier ce rendez-vous" onClick={onClearContext}>×</button>
        </div>
      )}
      {preview && (
        <div className="msg-composer-photo">
          <img src={preview} alt="Photo à envoyer" />
          <button type="button" aria-label="Retirer la photo" onClick={() => { setPhoto(null); if (fileRef.current) fileRef.current.value = ''; }}>×</button>
        </div>
      )}
      <div className="msg-composer-row">
        <label className="msg-attach" aria-label="Ajouter une photo" title="Ajouter une photo">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={disabled}
            onChange={(e) => setPhoto(e.target.files?.[0] || null)}
          />
        </label>
        <label className="msg-visually-hidden" htmlFor="msg-text">Votre message</label>
        <textarea
          id="msg-text"
          ref={textRef}
          rows={1}
          maxLength={2000}
          placeholder={placeholder}
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className="msg-send" disabled={disabled || sending || (!text.trim() && !photo)} aria-label="Envoyer">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" />
          </svg>
        </button>
      </div>
    </form>
  );
}

export default function MessageThread({ messages, me, photoUrl, otherName, onDeleteOwn, emptyText }) {
  const [zoom, setZoom] = useState(null);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const lastOwn = [...messages].reverse().find((m) => m.sender === me);
  let previousDay = null;

  return (
    <div className="msg-thread">
      {messages.length === 0 && <p className="msg-empty">{emptyText}</p>}
      {messages.map((m) => {
        const date = new Date(m.createdAt);
        const showDay = dayKey(date) !== previousDay;
        previousDay = dayKey(date);
        const mine = m.sender === me;
        return (
          <div key={m.id} className="msg-item">
            {showDay && <p className="msg-day">{dayLabel(date)}</p>}
            <div className={`msg-row ${mine ? 'is-mine' : ''}`}>
              <div className="msg-bubble">
                {!mine && <span className="msg-author">{otherName}</span>}
                {m.reservation && <span className="msg-about">{reservationLabel(m.reservation)}</span>}
                {m.hasPhoto && (
                  <button type="button" className="msg-photo" onClick={() => setZoom(photoUrl(m.id))} aria-label="Agrandir la photo">
                    <img src={photoUrl(m.id)} alt="Photo envoyée" loading="lazy" />
                  </button>
                )}
                {m.body && <span className="msg-text">{m.body}</span>}
                <span className="msg-meta">
                  {date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  {mine && m.id === lastOwn?.id && m.readAt ? ' · Vu' : ''}
                </span>
              </div>
              {mine && onDeleteOwn && (
                <button type="button" className="msg-delete" aria-label="Supprimer ce message" onClick={() => onDeleteOwn(m)}>×</button>
              )}
            </div>
          </div>
        );
      })}
      <div ref={endRef} />
      {zoom && (
        <div className="msg-zoom" role="dialog" aria-modal="true" aria-label="Photo" onClick={() => setZoom(null)}>
          <img src={zoom} alt="Photo en grand" />
          <button type="button" aria-label="Fermer">×</button>
        </div>
      )}
    </div>
  );
}
