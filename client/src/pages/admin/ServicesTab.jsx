import { useEffect, useState } from 'react';
import { apiFetch } from '../../api/client';
import { useToast } from '../../context/ToastContext';

const EMPTY_FORM = { name: '', description: '', category: 'coiffure', durationMinutes: 30, priceCents: 0, addons: [] };

let addonKeySeq = 0;
function emptyAddon() {
  addonKeySeq += 1;
  return { key: `new-${addonKeySeq}`, name: '', priceEuros: '0.00', durationMinutes: 0 };
}

// Suppléments optionnels d'une prestation (ex: "Nail Art" sur une manucure)
// — ajoutent du prix ET de la durée. Édité en liste libre (add/remove),
// comme les créneaux horaires dans l'onglet Horaires.
function AddonEditor({ addons, onChange }) {
  function addRow() {
    onChange([...addons, emptyAddon()]);
  }
  function removeRow(key) {
    onChange(addons.filter((a) => a.key !== key));
  }
  function updateRow(key, patch) {
    onChange(addons.map((a) => (a.key === key ? { ...a, ...patch } : a)));
  }

  return (
    <div className="addon-editor">
      <label>Suppléments (optionnel)</label>
      {addons.map((a) => (
        <div className="addon-row" key={a.key}>
          <input
            type="text"
            placeholder="Nom (ex : Nail Art)"
            maxLength={100}
            value={a.name}
            onChange={(e) => updateRow(a.key, { name: e.target.value })}
          />
          <input
            type="number"
            min={0}
            step="0.01"
            placeholder="Prix (€)"
            value={a.priceEuros}
            onChange={(e) => updateRow(a.key, { priceEuros: e.target.value })}
          />
          <input
            type="number"
            min={0}
            max={240}
            placeholder="Durée (min)"
            value={a.durationMinutes}
            onChange={(e) => updateRow(a.key, { durationMinutes: e.target.value })}
          />
          <button type="button" className="range-remove-btn" onClick={() => removeRow(a.key)}>Retirer</button>
        </div>
      ))}
      <button type="button" className="btn btn-outline btn-sm add-range-btn" onClick={addRow}>
        + Ajouter un supplément
      </button>
    </div>
  );
}

function addonsToPayload(addons) {
  return addons
    .filter((a) => a.name.trim())
    .map((a) => ({
      name: a.name.trim(),
      extraPriceCents: Math.round(Number(a.priceEuros) * 100),
      extraDurationMinutes: Number(a.durationMinutes) || 0,
    }));
}

export default function ServicesTab() {
  const showToast = useToast();
  const [services, setServices] = useState(null);
  const [error, setError] = useState(null);
  const [newService, setNewService] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [createFeedback, setCreateFeedback] = useState(null);

  function load() {
    setError(null);
    apiFetch('/admin/services')
      .then(setServices)
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function handleCreate(e) {
    e.preventDefault();
    setCreateFeedback(null);

    if (!newService.name.trim()) {
      setCreateFeedback('Le nom est requis.');
      return;
    }

    setCreating(true);
    try {
      const created = await apiFetch('/admin/services', {
        method: 'POST',
        body: {
          name: newService.name.trim(),
          description: newService.description.trim(),
          category: newService.category,
          durationMinutes: Number(newService.durationMinutes),
          priceCents: Math.round(Number(newService.priceCents) * 100),
          addons: addonsToPayload(newService.addons),
        },
      });
      setServices((rows) => [...(rows ?? []), created]);
      setNewService(EMPTY_FORM);
      showToast('Prestation ajoutée.', 'success');
    } catch (err) {
      setCreateFeedback(err.message);
      showToast(err.message, 'error');
    } finally {
      setCreating(false);
    }
  }

  async function saveService(id, patch) {
    try {
      const updated = await apiFetch(`/admin/services/${id}`, { method: 'PATCH', body: patch });
      setServices((rows) => rows.map((s) => (s.id === id ? updated : s)));
      showToast('Prestation mise à jour.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function removeService(id) {
    if (!window.confirm('Supprimer définitivement cette prestation ?')) return;
    try {
      await apiFetch(`/admin/services/${id}`, { method: 'DELETE' });
      setServices((rows) => rows.filter((s) => s.id !== id));
      showToast('Prestation supprimée.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  const coiffure = (services ?? []).filter((s) => s.category === 'coiffure');
  const ongles = (services ?? []).filter((s) => s.category === 'ongles');

  return (
    <>
      <form className="card upload-form" style={{ maxWidth: 640 }} noValidate onSubmit={handleCreate}>
        <h2>Ajouter une prestation</h2>
        <div className="form-row">
          <label htmlFor="new-service-name">Nom</label>
          <input
            type="text"
            id="new-service-name"
            required
            maxLength={100}
            value={newService.name}
            onChange={(e) => setNewService((f) => ({ ...f, name: e.target.value }))}
          />
        </div>
        <div className="form-row">
          <label htmlFor="new-service-description">Description</label>
          <input
            type="text"
            id="new-service-description"
            maxLength={500}
            value={newService.description}
            onChange={(e) => setNewService((f) => ({ ...f, description: e.target.value }))}
          />
        </div>
        <div className="form-row">
          <label htmlFor="new-service-category">Catégorie</label>
          <select
            id="new-service-category"
            value={newService.category}
            onChange={(e) => setNewService((f) => ({ ...f, category: e.target.value }))}
          >
            <option value="coiffure">Coiffure</option>
            <option value="ongles">Ongles</option>
          </select>
        </div>
        <div className="form-row two-col">
          <div>
            <label htmlFor="new-service-duration">Durée (minutes)</label>
            <input
              type="number"
              id="new-service-duration"
              min={5}
              max={480}
              required
              value={newService.durationMinutes}
              onChange={(e) => setNewService((f) => ({ ...f, durationMinutes: e.target.value }))}
            />
          </div>
          <div>
            <label htmlFor="new-service-price">Prix (€)</label>
            <input
              type="number"
              id="new-service-price"
              min={0}
              step="0.01"
              required
              value={newService.priceCents}
              onChange={(e) => setNewService((f) => ({ ...f, priceCents: e.target.value }))}
            />
          </div>
        </div>
        <AddonEditor addons={newService.addons} onChange={(addons) => setNewService((f) => ({ ...f, addons }))} />
        {createFeedback && <div className="form-feedback error">{createFeedback}</div>}
        <button type="submit" className="btn btn-primary" disabled={creating}>
          {creating ? 'Ajout en cours…' : 'Ajouter la prestation'}
        </button>
      </form>

      {error && <p className="loading-text">Erreur : {error}</p>}
      {!error && services === null && <p className="loading-text">Chargement…</p>}

      {!error && services !== null && (
        <>
          <h2 className="category-title" style={{ marginTop: 40 }}>Coiffure</h2>
          <div className="admin-services-grid">
            {coiffure.map((s) => <ServiceEditCard key={s.id} service={s} onSave={saveService} onDelete={removeService} />)}
          </div>

          <h2 className="category-title" style={{ marginTop: 40 }}>Ongles</h2>
          <div className="admin-services-grid">
            {ongles.map((s) => <ServiceEditCard key={s.id} service={s} onSave={saveService} onDelete={removeService} />)}
          </div>
        </>
      )}
    </>
  );
}

function ServiceEditCard({ service, onSave, onDelete }) {
  const [name, setName] = useState(service.name);
  const [description, setDescription] = useState(service.description);
  const [durationMinutes, setDurationMinutes] = useState(service.duration_minutes);
  const [priceEuros, setPriceEuros] = useState((service.price_cents / 100).toFixed(2));
  const [active, setActive] = useState(Boolean(service.active));
  const [addons, setAddons] = useState(() =>
    (service.addons ?? []).map((a) => ({
      key: `existing-${a.id}`,
      name: a.name,
      priceEuros: (a.extra_price_cents / 100).toFixed(2),
      durationMinutes: a.extra_duration_minutes,
    })),
  );

  function save() {
    onSave(service.id, {
      name,
      description,
      durationMinutes: Number(durationMinutes),
      priceCents: Math.round(Number(priceEuros) * 100),
      active,
      addons: addonsToPayload(addons),
    });
  }

  return (
    <div className="admin-service-card">
      {!active && <span className="inactive-badge">Inactive</span>}
      <div className="form-row">
        <label>Nom</label>
        <input type="text" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="form-row">
        <label>Description</label>
        <input type="text" value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="form-row two-col">
        <div>
          <label>Durée (min)</label>
          <input type="number" min={5} max={480} value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} />
        </div>
        <div>
          <label>Prix (€)</label>
          <input type="number" min={0} step="0.01" value={priceEuros} onChange={(e) => setPriceEuros(e.target.value)} />
        </div>
      </div>
      <AddonEditor addons={addons} onChange={setAddons} />
      <div className="admin-service-card-actions">
        <label className="admin-service-active-toggle">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Active
        </label>
        <div className="admin-service-card-buttons">
          <button type="button" className="btn btn-outline btn-sm" onClick={save}>Enregistrer</button>
          <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => onDelete(service.id)}>Supprimer</button>
        </div>
      </div>
    </div>
  );
}
