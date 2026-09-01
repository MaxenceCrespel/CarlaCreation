import { useEffect, useState } from 'react';
import { apiFetch } from '../../api/client';
import { useToast } from '../../context/ToastContext';

const FILTERS = [
  { key: 'all', label: 'Tous' },
  { key: 'unread', label: 'Non lus' },
  { key: 'read', label: 'Lus' },
];

export default function MessagesTab() {
  const showToast = useToast();
  const [messages, setMessages] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('unread');

  function load() {
    setError(null);
    apiFetch('/admin/contact-messages')
      .then(setMessages)
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function setRead(id, isRead) {
    try {
      const updated = await apiFetch(`/admin/contact-messages/${id}`, { method: 'PATCH', body: { isRead } });
      setMessages((rows) => rows.map((m) => (m.id === id ? updated : m)));
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function remove(id) {
    if (!window.confirm('Supprimer définitivement ce message ?')) return;
    try {
      await apiFetch(`/admin/contact-messages/${id}`, { method: 'DELETE' });
      setMessages((rows) => rows.filter((m) => m.id !== id));
      showToast('Message supprimé.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  const filtered = (messages ?? []).filter((m) => {
    if (filter === 'unread') return !m.is_read;
    if (filter === 'read') return m.is_read;
    return true;
  });
  const unreadCount = (messages ?? []).filter((m) => !m.is_read).length;

  return (
    <div className="card">
      <h2>Messages de contact</h2>
      <p className="section-lead">
        Les messages envoyés depuis le formulaire de contact du site apparaissent ici.
      </p>

      <div className="admin-filter-row" role="tablist" aria-label="Filtrer les messages">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={filter === f.key}
            className={`admin-filter-btn ${filter === f.key ? 'is-active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}{f.key === 'unread' && unreadCount > 0 ? ` (${unreadCount})` : ''}
          </button>
        ))}
      </div>

      {error && <p className="loading-text">Erreur : {error}</p>}
      {!error && messages === null && <p className="loading-text">Chargement…</p>}
      {!error && messages !== null && filtered.length === 0 && (
        <p className="loading-text">Aucun message dans cette catégorie.</p>
      )}

      {!error && filtered.length > 0 && (
        <ul className="admin-review-list">
          {filtered.map((message) => (
            <li key={message.id} className={`admin-review-card ${message.is_read ? '' : 'status-pending'}`}>
              <div className="admin-review-head">
                <span className={`status-badge ${message.is_read ? 'status-approved' : 'status-pending'}`}>
                  {message.is_read ? 'Lu' : 'Non lu'}
                </span>
              </div>
              <p className="admin-review-comment">« {message.message} »</p>
              <p className="admin-review-meta">
                — {message.name} ({message.email}) · {new Date(message.created_at).toLocaleDateString('fr-FR')}
              </p>
              <div className="admin-review-actions">
                {message.is_read ? (
                  <button type="button" onClick={() => setRead(message.id, false)}>Marquer non lu</button>
                ) : (
                  <button type="button" className="save-btn" onClick={() => setRead(message.id, true)}>Marquer lu</button>
                )}
                <button type="button" className="danger" onClick={() => remove(message.id)}>Supprimer</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
