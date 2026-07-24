import { useEffect, useState } from 'react';
import { apiFetch } from '../../api/client';
import { useToast } from '../../context/ToastContext';

const EMPTY_FORM = { name: '', description: '', categoryId: '', durationMinutes: 30, priceCents: 0, addons: [] };

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

// Flattens the (max one level deep) category tree into a single ordered
// list — each top-level category immediately followed by its
// subcategories — so selects/groupings can just iterate it in display
// order without re-deriving the tree every time.
function orderedCategoryTree(categories) {
  const topLevel = categories.filter((c) => !c.parent_id).sort((a, b) => a.sort_order - b.sort_order);
  const result = [];
  for (const top of topLevel) {
    result.push({ ...top, depth: 0 });
    categories
      .filter((c) => c.parent_id === top.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .forEach((child) => result.push({ ...child, depth: 1 }));
  }
  return result;
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

// One row (name input + reorder/delete) for a single category, top-level or
// subcategory — the parent component decides where it's rendered.
function CategoryRow({ category, siblings, index, onRename, onLocalEdit, onMove, onRemove }) {
  return (
    <div className="category-manage-row">
      <input
        type="text"
        value={category.name}
        maxLength={60}
        onChange={(e) => onLocalEdit(category.id, e.target.value)}
        onBlur={(e) => onRename(category.id, e.target.value)}
      />
      <button type="button" className="btn btn-outline btn-sm" onClick={() => onMove(siblings, index, -1)} disabled={index === 0} aria-label="Monter">
        ↑
      </button>
      <button
        type="button"
        className="btn btn-outline btn-sm"
        onClick={() => onMove(siblings, index, 1)}
        disabled={index === siblings.length - 1}
        aria-label="Descendre"
      >
        ↓
      </button>
      <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => onRemove(category.id)}>
        Supprimer
      </button>
    </div>
  );
}

// Admin-managed groupings for services (e.g. "Coiffure", "Ongles", and
// whatever else Carla wants to add later, like "Homme"), with one level of
// subcategories (e.g. "Hommes" under "Coiffure") — a service can attach
// directly to a top-level category or to one of its subcategories.
// Renaming saves on blur; reordering swaps sort_order with the sibling at
// the same level (subcategories only reorder among their own siblings).
function CategoriesManager({ categories, setCategories }) {
  const showToast = useToast();
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [subNames, setSubNames] = useState({}); // { [parentId]: draft name }

  const topLevel = categories.filter((c) => !c.parent_id).sort((a, b) => a.sort_order - b.sort_order);
  const childrenOf = (parentId) => categories.filter((c) => c.parent_id === parentId).sort((a, b) => a.sort_order - b.sort_order);

  async function addCategory(e, parentId = null) {
    e.preventDefault();
    const name = (parentId ? subNames[parentId] : newName)?.trim();
    if (!name) return;
    setAdding(true);
    try {
      const created = await apiFetch('/admin/service-categories', {
        method: 'POST',
        body: parentId ? { name, parentId } : { name },
      });
      setCategories((cats) => [...cats, created]);
      if (parentId) setSubNames((f) => ({ ...f, [parentId]: '' }));
      else setNewName('');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setAdding(false);
    }
  }

  function localEdit(id, name) {
    setCategories((cats) => cats.map((x) => (x.id === id ? { ...x, name } : x)));
  }

  async function rename(id, name) {
    if (!name.trim()) return;
    try {
      const updated = await apiFetch(`/admin/service-categories/${id}`, { method: 'PATCH', body: { name: name.trim() } });
      setCategories((cats) => cats.map((c) => (c.id === id ? updated : c)));
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function move(siblings, index, direction) {
    const target = siblings[index + direction];
    const current = siblings[index];
    if (!target) return;
    try {
      const [a, b] = await Promise.all([
        apiFetch(`/admin/service-categories/${current.id}`, { method: 'PATCH', body: { sortOrder: target.sort_order } }),
        apiFetch(`/admin/service-categories/${target.id}`, { method: 'PATCH', body: { sortOrder: current.sort_order } }),
      ]);
      setCategories((cats) => cats.map((c) => (c.id === a.id ? a : c.id === b.id ? b : c)));
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function remove(id) {
    if (!window.confirm('Supprimer cette catégorie ?')) return;
    try {
      await apiFetch(`/admin/service-categories/${id}`, { method: 'DELETE' });
      setCategories((cats) => cats.filter((c) => c.id !== id));
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  return (
    <div className="card categories-manager">
      <h2>Catégories de prestations</h2>
      <p className="section-lead">
        Organisez vos prestations par catégorie (ex : Coiffure, Ongles, Homme…) — elles apparaissent dans cet ordre
        sur le site et dans la réservation. Chaque catégorie peut avoir des sous-catégories (ex : "Hommes" dans
        "Coiffure"), sur un seul niveau.
      </p>
      <ul className="category-manage-list">
        {topLevel.map((cat, i) => {
          const children = childrenOf(cat.id);
          return (
            <li key={cat.id} className="category-manage-group">
              <CategoryRow category={cat} siblings={topLevel} index={i} onRename={rename} onLocalEdit={localEdit} onMove={move} onRemove={remove} />
              {children.length > 0 && (
                <ul className="category-manage-sublist">
                  {children.map((child, j) => (
                    <li key={child.id}>
                      <CategoryRow category={child} siblings={children} index={j} onRename={rename} onLocalEdit={localEdit} onMove={move} onRemove={remove} />
                    </li>
                  ))}
                </ul>
              )}
              <form className="category-add-form category-add-sub-form" onSubmit={(e) => addCategory(e, cat.id)}>
                <input
                  type="text"
                  placeholder={`Sous-catégorie de ${cat.name}`}
                  maxLength={60}
                  value={subNames[cat.id] || ''}
                  onChange={(e) => setSubNames((f) => ({ ...f, [cat.id]: e.target.value }))}
                />
                <button type="submit" className="btn btn-outline btn-sm" disabled={adding}>
                  + Sous-catégorie
                </button>
              </form>
            </li>
          );
        })}
      </ul>
      <form onSubmit={addCategory} className="category-add-form">
        <input
          type="text"
          placeholder="Nouvelle catégorie (ex : Homme)"
          maxLength={60}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button type="submit" className="btn btn-outline btn-sm" disabled={adding}>
          {adding ? 'Ajout…' : '+ Ajouter'}
        </button>
      </form>
    </div>
  );
}

export default function ServicesTab() {
  const showToast = useToast();
  const [services, setServices] = useState(null);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState(null);
  const [newService, setNewService] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [createFeedback, setCreateFeedback] = useState(null);

  function load() {
    setError(null);
    Promise.all([apiFetch('/admin/services'), apiFetch('/admin/service-categories')])
      .then(([servicesRes, categoriesRes]) => {
        setServices(servicesRes);
        setCategories(categoriesRes);
      })
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
    if (!newService.categoryId) {
      setCreateFeedback('Choisissez une catégorie.');
      return;
    }

    setCreating(true);
    try {
      const created = await apiFetch('/admin/services', {
        method: 'POST',
        body: {
          name: newService.name.trim(),
          description: newService.description.trim(),
          categoryId: Number(newService.categoryId),
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

  return (
    <>
      <CategoriesManager categories={categories} setCategories={setCategories} />

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
            required
            value={newService.categoryId}
            onChange={(e) => setNewService((f) => ({ ...f, categoryId: e.target.value }))}
          >
            <option value="" disabled>Choisissez une catégorie</option>
            {orderedCategoryTree(categories).map((c) => (
              <option key={c.id} value={c.id}>{c.depth > 0 ? `— ${c.name}` : c.name}</option>
            ))}
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

      {!error && services !== null && orderedCategoryTree(categories).map((cat) => (
        <div key={cat.id}>
          <h2 className={`category-title ${cat.depth > 0 ? 'category-title-sub' : ''}`} style={{ marginTop: 40 }}>{cat.name}</h2>
          <div className="admin-services-grid">
            {services
              .filter((s) => s.category_id === cat.id)
              .map((s) => (
                <ServiceEditCard key={s.id} service={s} categories={categories} onSave={saveService} onDelete={removeService} />
              ))}
          </div>
        </div>
      ))}
    </>
  );
}

function ServiceEditCard({ service, categories, onSave, onDelete }) {
  const [name, setName] = useState(service.name);
  const [description, setDescription] = useState(service.description);
  const [categoryId, setCategoryId] = useState(service.category_id);
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
      categoryId: Number(categoryId),
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
      <div className="form-row">
        <label>Catégorie</label>
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          {orderedCategoryTree(categories).map((c) => (
            <option key={c.id} value={c.id}>{c.depth > 0 ? `— ${c.name}` : c.name}</option>
          ))}
        </select>
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
