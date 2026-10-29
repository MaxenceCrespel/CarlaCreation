import { useEffect, useState } from 'react';
import { apiFetch } from '../../../api/client';
import { useToast } from '../../../context/ToastContext';
import { Badge, Empty, ErrorText, Icon, Loading, SearchField, Sheet, TopBar } from './ui';
import { initials, plural } from './helpers';

export function ClientForm({ form, setForm, idPrefix }) {
  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  return (
    <>
      <div className="m-field">
        <label htmlFor={`${idPrefix}-name`}>Prénom et nom</label>
        <input id={`${idPrefix}-name`} type="text" maxLength={200} autoComplete="off" value={form.name} onChange={update('name')} />
      </div>
      <div className="m-field">
        <label htmlFor={`${idPrefix}-phone`}>Téléphone</label>
        <input id={`${idPrefix}-phone`} type="tel" maxLength={50} value={form.phone} onChange={update('phone')} />
      </div>
      <div className="m-field">
        <label htmlFor={`${idPrefix}-birthdate`}>Date de naissance (pour le cadeau d'anniversaire)</label>
        <input id={`${idPrefix}-birthdate`} type="date" value={form.birthdate} onChange={update('birthdate')} />
      </div>
      <div className="m-field">
        <label htmlFor={`${idPrefix}-notes`}>Notes privées</label>
        <textarea id={`${idPrefix}-notes`} rows={3} maxLength={5000} placeholder="Ex : a fait un 4.1 au dernier rdv…" value={form.notes} onChange={update('notes')} />
      </div>
    </>
  );
}

function NewClientSheet({ prefill, onClose, onCreated }) {
  const showToast = useToast();
  const [form, setForm] = useState({ name: '', phone: '', birthdate: '', notes: '', ...prefill });
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!form.name.trim()) {
      showToast('Le nom est requis.', 'error');
      return;
    }
    setSaving(true);
    try {
      const created = await apiFetch('/admin/clients', {
        method: 'POST',
        body: { name: form.name.trim(), phone: form.phone.trim(), notes: form.notes.trim(), birthdate: form.birthdate || undefined },
      });
      showToast('Fiche créée.', 'success');
      onCreated(created);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      title="Nouvelle fiche"
      onClose={onClose}
      left={{ label: 'Annuler', onClick: onClose }}
      right={{ label: saving ? 'Création…' : 'Créer', onClick: save, disabled: saving }}
    >
      <ClientForm form={form} setForm={setForm} idPrefix="m-new-client" />
    </Sheet>
  );
}

// Liste des clientes : recherche (qui retrouve aussi les anciennes clientes
// sans fiche, via leurs réservations) et accès à chaque fiche.
export default function ClientsScreen({ go }) {
  const [clients, setClients] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [newClient, setNewClient] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setError(null);
    apiFetch(`/admin/clients${debounced ? `?q=${encodeURIComponent(debounced)}` : ''}`)
      .then(setClients)
      .catch((err) => setError(err.message));
  }, [debounced]);

  return (
    <div className="m-screen">
      <TopBar title="Clientes" action={{ label: '+ Fiche', onClick: () => setNewClient({}) }}>
        <SearchField id="m-client-search" label="Rechercher une cliente" placeholder="Nom ou téléphone…" value={search} onChange={setSearch} />
      </TopBar>

      {error && <ErrorText>{error}</ErrorText>}
      {!error && clients === null && <Loading />}
      {!error && clients !== null && clients.length === 0 && (
        <Empty>{debounced ? 'Aucun résultat pour cette recherche.' : 'Aucune fiche pour le moment.'}</Empty>
      )}
      {!error && clients !== null && clients.length > 0 && (
        <div className="m-card m-list">
          {clients.map((c) =>
            c.hasFiche ? (
              <button key={c.id} type="button" className="m-list-item m-client-row" onClick={() => go(`clients/${c.id}`)}>
                <span className="m-avatar" aria-hidden="true">{initials(c.name)}</span>
                <span className="m-grow">
                  <strong className="m-ellipsis">{c.name}</strong>
                  <span className="m-muted m-ellipsis">
                    {c.reservationCount ? plural(c.reservationCount, 'rendez-vous', 'rendez-vous') : 'Aucun rendez-vous lié'}
                    {c.phone ? ` · ${c.phone}` : ''}
                  </span>
                </span>
                <Icon name="next" size={18} />
              </button>
            ) : (
              <div key={`h-${c.phone}-${c.name}`} className="m-list-item m-client-row">
                <span className="m-avatar is-ghost" aria-hidden="true">{initials(c.name)}</span>
                <span className="m-grow">
                  <strong className="m-ellipsis">{c.name}</strong>
                  <span className="m-muted m-ellipsis">{c.phone || c.email || '—'}</span>
                </span>
                <Badge tone="wait">Sans fiche</Badge>
                <button type="button" className="m-link m-link-sm" onClick={() => setNewClient({ name: c.name, phone: c.phone || '' })}>Créer</button>
              </div>
            ),
          )}
        </div>
      )}

      {newClient && (
        <NewClientSheet
          prefill={newClient}
          onClose={() => setNewClient(null)}
          onCreated={(created) => {
            setNewClient(null);
            go(`clients/${created.id}`);
          }}
        />
      )}
    </div>
  );
}
