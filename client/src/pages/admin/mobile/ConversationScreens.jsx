import { useCallback, useEffect, useState } from 'react';
import { apiFetch, apiUpload } from '../../../api/client';
import { useConfirm } from '../../../context/ConfirmContext';
import { useToast } from '../../../context/ToastContext';
import MessageThread, { Composer } from '../../../components/MessageThread';
import { Empty, ErrorText, Icon, Loading, TopBar } from './ui';
import { initials, relativeDay, telHref, toDateStr } from './helpers';

const REFRESH_MS = 20_000;

// Conversations with client accounts, newest activity first.
export function ConversationList({ go }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiFetch('/admin/conversations').then(setRows).catch((err) => setError(err.message));
  }, []);

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!rows) return <Loading />;

  return (
    <>
      {rows.length === 0 ? (
        <Empty>Aucune conversation pour le moment. Les clientes qui ont un compte peuvent vous écrire depuis « Mon compte ».</Empty>
      ) : (
        <div className="m-card m-list">
          {rows.map((c) => (
            <button key={c.clientId} type="button" className="m-list-item m-message-row" onClick={() => go(`plus/messages/${c.clientId}`)}>
              <span className="m-avatar" aria-hidden="true">{initials(c.name)}</span>
              <span className="m-grow">
                <span className="m-message-top">
                  <strong className={c.unread ? 'm-ellipsis' : 'm-ellipsis m-normal'}>{c.name}</strong>
                  <span className="m-muted m-small">{relativeDay(toDateStr(new Date(c.lastAt)))}</span>
                </span>
                <span className={`m-ellipsis ${c.unread ? '' : 'm-muted'}`}>
                  {c.lastSender === 'admin' ? 'Vous : ' : ''}{c.lastMessage}
                </span>
              </span>
              {c.unread > 0 && <span className="m-count">{c.unread}</span>}
            </button>
          ))}
        </div>
      )}
      <p className="m-hint">Pour écrire la première à une cliente, ouvrez sa fiche puis « Message ».</p>
    </>
  );
}

// One conversation, composer pinned above the tab bar.
export function ConversationThread({ clientId, onBack, go, refreshCounts }) {
  const confirm = useConfirm();
  const showToast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const conv = await apiFetch(`/admin/conversations/${clientId}`);
      setData(conv);
      if (conv.messages.some((m) => m.sender === 'client' && !m.readAt)) {
        await apiFetch(`/admin/conversations/${clientId}/read`, { method: 'POST' });
        refreshCounts();
      }
    } catch (err) {
      setError(err.message);
    }
  }, [clientId, refreshCounts]);

  useEffect(() => {
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  async function send({ body, photo }) {
    const form = new FormData();
    if (body) form.append('body', body);
    if (photo) form.append('photo', photo);
    try {
      const created = await apiUpload(`/admin/conversations/${clientId}`, form);
      setData((d) => ({ ...d, messages: [...d.messages, created] }));
      return true;
    } catch (err) {
      showToast(err.message, 'error');
      return false;
    }
  }

  async function remove(message) {
    if (!(await confirm('Supprimer ce message ? La cliente ne le verra plus.'))) return;
    try {
      await apiFetch(`/admin/conversations/messages/${message.id}`, { method: 'DELETE' });
      setData((d) => ({ ...d, messages: d.messages.filter((m) => m.id !== message.id) }));
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  const client = data?.client;

  return (
    <div className="m-screen m-has-composer">
      <TopBar back={{ label: 'Messages', onClick: onBack }}>
        {client && (
          <div className="m-conv-head">
            <button type="button" className="m-plain m-conv-who" onClick={() => go(`clients/${client.id}`)}>
              <span className="m-avatar" aria-hidden="true">{initials(client.name)}</span>
              <span className="m-grow">
                <strong className="m-ellipsis">{client.name}</strong>
                <span className="m-muted m-small">Voir la fiche ›</span>
              </span>
            </button>
            {client.phone && (
              <a className="m-round-btn" href={telHref(client.phone)} aria-label={`Appeler ${client.name}`}><Icon name="phone" size={18} /></a>
            )}
          </div>
        )}
      </TopBar>
      {error && <ErrorText>{error}</ErrorText>}
      {!error && !data && <Loading />}
      {data && (
        <MessageThread
          messages={data.messages}
          me="admin"
          otherName={client.name.split(' ')[0]}
          photoUrl={(id) => `/api/admin/conversations/photo/${id}`}
          onDeleteOwn={remove}
          emptyText={client.hasAccount ? `Écrivez le premier message à ${client.name.split(' ')[0]} : elle le recevra par email.` : ''}
        />
      )}
      {data && !client.hasAccount && (
        <p className="m-warning">{client.name} n'a pas de compte en ligne : elle ne pourrait pas lire vos messages. Appelez-la ou envoyez-lui un SMS.</p>
      )}
      {data && client.hasAccount && (
        <div className="m-composer-bar">
          <Composer onSend={send} placeholder={`Message à ${client.name.split(' ')[0]}…`} />
        </div>
      )}
    </div>
  );
}
