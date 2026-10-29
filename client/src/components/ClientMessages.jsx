import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, apiUpload } from '../api/client';
import { useToast } from '../context/ToastContext';
import MessageThread, { Composer } from './MessageThread';

const REFRESH_MS = 30_000;

function formatShortDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
}

// « Mes messages » in the client's account: her conversation with the salon.
// `askAbout` is a history row picked with « Poser une question » — the next
// message is then linked to that appointment.
export default function ClientMessages({ askAbout, onClearAsk }) {
  const showToast = useToast();
  const [messages, setMessages] = useState(null);
  const cardRef = useRef(null);
  const loaded = messages !== null;

  const load = useCallback(async () => {
    try {
      const rows = await apiFetch('/client-messages');
      setMessages(rows);
      if (rows.some((m) => m.sender === 'admin' && !m.readAt)) {
        await apiFetch('/client-messages/read', { method: 'POST' });
      }
    } catch {
      setMessages((current) => current ?? []);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  // Arriving from the email link (/mon-compte#messages), or after picking
  // « Poser une question » on an appointment.
  useEffect(() => {
    if (window.location.hash === '#messages' || askAbout) {
      cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [askAbout, loaded]);

  async function send({ body, photo }) {
    const data = new FormData();
    if (body) data.append('body', body);
    if (photo) data.append('photo', photo);
    if (askAbout) data.append('reservationId', String(askAbout.id));
    try {
      const created = await apiUpload('/client-messages', data);
      setMessages((rows) => [...(rows ?? []), created]);
      onClearAsk?.();
      return true;
    } catch (err) {
      showToast(err.message, 'error');
      return false;
    }
  }

  const unread = (messages ?? []).filter((m) => m.sender === 'admin' && !m.readAt).length;

  return (
    <div className="card client-messages-card" id="messages" ref={cardRef} style={{ marginTop: 16, scrollMarginTop: 90 }}>
      <div className="client-messages-head">
        <h2 style={{ margin: 0 }}>Mes messages</h2>
        {unread > 0 && <span className="count" aria-label={`${unread} nouveau(x) message(s)`}>{unread}</span>}
      </div>
      <p className="section-lead" style={{ marginBottom: 8 }}>
        Une question, une photo d'inspiration ? Écrivez-moi ici, je vous réponds dès que possible (vous recevez un email à chaque réponse).
      </p>
      {messages === null ? (
        <p className="loading-text">Chargement…</p>
      ) : (
        <MessageThread
          messages={messages}
          me="client"
          otherName="Carla"
          photoUrl={(id) => `/api/client-messages/photo/${id}`}
          emptyText="Pas encore de message. Écrivez le premier !"
        />
      )}
      <Composer
        onSend={send}
        disabled={messages === null}
        placeholder="Votre message…"
        context={askAbout ? `À propos du rendez-vous du ${formatShortDate(askAbout.reservation_date)} · ${askAbout.service_name}` : null}
        onClearContext={onClearAsk}
      />
    </div>
  );
}
