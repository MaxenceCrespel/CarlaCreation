import { useEffect, useState } from 'react';
import { apiFetch } from '../../../api/client';
import { useConfirm } from '../../../context/ConfirmContext';
import { useToast } from '../../../context/ToastContext';
import { Chips, Empty, ErrorText, Icon, Loading, Segmented, TopBar } from './ui';
import { ConversationList, ConversationThread } from './ConversationScreens';
import { initials, relativeDay, smsHref, telHref, toDateStr } from './helpers';

function sentAt(message) {
  const d = new Date(message.created_at);
  const day = relativeDay(toDateStr(d));
  return `${day} · ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
}

// Messages du formulaire de contact : boîte de réception, puis lecture en
// plein écran avec Appeler / SMS / créer un rendez-vous.
function ContactInbox({ onBack, refreshCounts, onCreateRdv, tabs }) {
  const confirm = useConfirm();
  const showToast = useToast();
  const [messages, setMessages] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    apiFetch('/admin/contact-messages')
      .then(setMessages)
      .catch((err) => setError(err.message));
  }, []);

  async function setRead(id, isRead) {
    try {
      const updated = await apiFetch(`/admin/contact-messages/${id}`, { method: 'PATCH', body: { isRead } });
      setMessages((rows) => rows.map((m) => (m.id === id ? updated : m)));
      refreshCounts();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function open(message) {
    setOpenId(message.id);
    if (!message.is_read) await setRead(message.id, true);
  }

  async function remove(id) {
    if (!(await confirm('Supprimer définitivement ce message ?'))) return;
    try {
      await apiFetch(`/admin/contact-messages/${id}`, { method: 'DELETE' });
      setMessages((rows) => rows.filter((m) => m.id !== id));
      setOpenId(null);
      refreshCounts();
      showToast('Message supprimé.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  const current = openId != null ? (messages ?? []).find((m) => m.id === openId) : null;

  if (current) {
    return (
      <div className="m-screen m-has-toolbar">
        <TopBar back={{ label: 'Messages', onClick: () => setOpenId(null) }} />
        <div className="m-message-head">
          <span className="m-avatar" aria-hidden="true">{initials(current.name)}</span>
          <span className="m-grow">
            <strong className="m-block">{current.name}</strong>
            <a href={telHref(current.phone)}>{current.phone}</a>
          </span>
          <span className="m-muted m-small">{sentAt(current)}</span>
        </div>
        <div className="m-card m-card-pad m-message-body">{current.message}</div>
        <button
          type="button"
          className="m-btn m-btn-primary m-btn-block"
          onClick={() => onCreateRdv({ clientName: current.name, clientPhone: current.phone })}
        >
          Créer un rendez-vous pour {current.name.split(' ')[0]}
        </button>
        <div className="m-toolbar">
          <a className="m-tool" href={telHref(current.phone)}><Icon name="phone" size={20} />Appeler</a>
          <a className="m-tool" href={smsHref(current.phone)}><Icon name="sms" size={20} />SMS</a>
          <button
            type="button"
            className="m-tool"
            onClick={async () => {
              await setRead(current.id, false);
              setOpenId(null);
            }}
          >
            <Icon name="mail" size={20} />Non lu
          </button>
          <button type="button" className="m-tool m-danger-text" onClick={() => remove(current.id)}><Icon name="trash" size={20} />Supprimer</button>
        </div>
      </div>
    );
  }

  const unread = (messages ?? []).filter((m) => !m.is_read).length;
  const list = (messages ?? []).filter((m) => (filter === 'unread' ? !m.is_read : true));

  return (
    <div className="m-screen">
      <TopBar title="Messages" back={{ label: 'Plus', onClick: onBack }}>
        {tabs}
        <Chips
          label="Filtrer les messages"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'Tous', count: messages?.length },
            { value: 'unread', label: 'Non lus', count: unread },
          ]}
        />
      </TopBar>
      {error && <ErrorText>{error}</ErrorText>}
      {!error && !messages && <Loading />}
      {messages && list.length === 0 && <Empty>{filter === 'unread' ? 'Aucun message non lu.' : 'Aucun message pour le moment.'}</Empty>}
      {list.length > 0 && (
        <div className="m-card m-list">
          {list.map((m) => (
            <button key={m.id} type="button" className="m-list-item m-message-row" onClick={() => open(m)}>
              <span className={m.is_read ? 'm-dot is-none' : 'm-dot'} aria-label={m.is_read ? undefined : 'Non lu'} />
              <span className="m-grow">
                <span className="m-message-top">
                  <strong className={m.is_read ? 'm-ellipsis m-normal' : 'm-ellipsis'}>{m.name}</strong>
                  <span className="m-muted m-small">{relativeDay(toDateStr(new Date(m.created_at)))}</span>
                </span>
                <span className="m-muted m-clamp">{m.message}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Deux boîtes : les conversations avec les clientes qui ont un compte, et
// les messages du formulaire de contact du site.
export default function MessagesScreen({ clientId, go, onBack, refreshCounts, onCreateRdv }) {
  const [tab, setTab] = useState('clients');

  if (clientId) {
    return <ConversationThread clientId={clientId} onBack={onBack} go={go} refreshCounts={refreshCounts} />;
  }

  const tabs = (
    <Segmented
      label="Type de messages"
      value={tab}
      onChange={setTab}
      options={[
        { value: 'clients', label: 'Clientes' },
        { value: 'form', label: 'Formulaire du site' },
      ]}
    />
  );

  if (tab === 'form') {
    return <ContactInbox onBack={onBack} refreshCounts={refreshCounts} onCreateRdv={onCreateRdv} tabs={tabs} />;
  }

  return (
    <div className="m-screen">
      <TopBar title="Messages" back={{ label: 'Plus', onClick: onBack }}>
        {tabs}
      </TopBar>
      <ConversationList go={go} />
    </div>
  );
}
