import { useEffect, useState } from 'react';
import { apiFetch } from '../../../api/client';
import { useConfirm } from '../../../context/ConfirmContext';
import { useToast } from '../../../context/ToastContext';
import { formatDuration, formatPrice } from '../../../utils/format';
import { Badge, Chips, Empty, ErrorText, Fab, Icon, Loading, Sheet, Switch, TopBar } from './ui';
import { orderedCategoryTree } from './helpers';

let addonKeySeq = 0;
const newAddon = () => ({ key: `new-${(addonKeySeq += 1)}`, name: '', priceEuros: '', durationMinutes: '' });

function formFrom(service, defaultCategoryId) {
  if (!service) {
    return { name: '', description: '', categoryId: defaultCategoryId ?? '', durationMinutes: '60', priceEuros: '', active: true, addons: [] };
  }
  return {
    name: service.name,
    description: service.description || '',
    categoryId: service.category_id,
    durationMinutes: String(service.duration_minutes),
    priceEuros: (service.price_cents / 100).toFixed(2),
    active: Boolean(service.active),
    addons: (service.addons ?? []).map((a) => ({
      key: `existing-${a.id}`,
      name: a.name,
      priceEuros: (a.extra_price_cents / 100).toFixed(2),
      durationMinutes: String(a.extra_duration_minutes),
    })),
  };
}

function ServiceSheet({ service, categories, defaultCategoryId, onClose, onSaved, onDeleted }) {
  const confirm = useConfirm();
  const showToast = useToast();
  const [form, setForm] = useState(() => formFrom(service, defaultCategoryId));
  const [saving, setSaving] = useState(false);
  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const updateAddon = (key, patch) => setForm((f) => ({ ...f, addons: f.addons.map((a) => (a.key === key ? { ...a, ...patch } : a)) }));

  async function save() {
    if (!form.name.trim()) return showToast('Le nom est requis.', 'error');
    if (!form.categoryId) return showToast('Choisissez une catégorie.', 'error');
    const body = {
      name: form.name.trim(),
      description: form.description.trim(),
      categoryId: Number(form.categoryId),
      durationMinutes: Number(form.durationMinutes),
      priceCents: Math.round(Number(form.priceEuros || 0) * 100),
      addons: form.addons
        .filter((a) => a.name.trim())
        .map((a) => ({ name: a.name.trim(), extraPriceCents: Math.round(Number(a.priceEuros || 0) * 100), extraDurationMinutes: Number(a.durationMinutes) || 0 })),
    };
    setSaving(true);
    try {
      const saved = service
        ? await apiFetch(`/admin/services/${service.id}`, { method: 'PATCH', body: { ...body, active: form.active } })
        : await apiFetch('/admin/services', { method: 'POST', body });
      showToast(service ? 'Prestation mise à jour.' : 'Prestation ajoutée.', 'success');
      onSaved(saved, !service);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!(await confirm('Supprimer définitivement cette prestation ?'))) return;
    try {
      await apiFetch(`/admin/services/${service.id}`, { method: 'DELETE' });
      showToast('Prestation supprimée.', 'success');
      onDeleted(service.id);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  return (
    <Sheet
      title={service ? 'Modifier' : 'Nouvelle prestation'}
      onClose={onClose}
      left={{ label: 'Annuler', onClick: onClose }}
      right={{ label: saving ? '…' : service ? 'Enregistrer' : 'Ajouter', onClick: save, disabled: saving }}
      tall
    >
      <div className="m-field">
        <label htmlFor="m-svc-name">Nom</label>
        <input id="m-svc-name" type="text" maxLength={100} value={form.name} onChange={update('name')} />
      </div>
      <div className="m-field">
        <label htmlFor="m-svc-desc">Description</label>
        <textarea id="m-svc-desc" rows={2} maxLength={500} value={form.description} onChange={update('description')} />
      </div>
      <div className="m-field-row">
        <div className="m-field">
          <label htmlFor="m-svc-duration">Durée (min)</label>
          <input id="m-svc-duration" type="number" inputMode="numeric" min={5} max={480} value={form.durationMinutes} onChange={update('durationMinutes')} />
        </div>
        <div className="m-field">
          <label htmlFor="m-svc-price">Prix (€)</label>
          <input id="m-svc-price" type="number" inputMode="decimal" min={0} step="0.01" value={form.priceEuros} onChange={update('priceEuros')} />
        </div>
      </div>
      <div className="m-field">
        <label htmlFor="m-svc-cat">Catégorie</label>
        <select id="m-svc-cat" value={form.categoryId} onChange={update('categoryId')}>
          <option value="" disabled>Choisissez une catégorie</option>
          {orderedCategoryTree(categories).map((c) => (
            <option key={c.id} value={c.id}>{c.depth ? `— ${c.name}` : c.name}</option>
          ))}
        </select>
      </div>
      {service && (
        <div className="m-switch-row m-field">
          <span>
            <strong className="m-block">Proposée en ligne</strong>
            <span className="m-muted m-small">Désactivée, elle n'apparaît plus sur le site</span>
          </span>
          <Switch checked={form.active} label="Prestation active" onChange={(active) => setForm((f) => ({ ...f, active }))} />
        </div>
      )}
      <div className="m-field">
        <span className="m-label">Suppléments (optionnel)</span>
        {form.addons.map((a) => (
          <div key={a.key} className="m-addon">
            <input type="text" aria-label="Nom du supplément" placeholder="Nom (ex : Nail art)" maxLength={100} value={a.name} onChange={(e) => updateAddon(a.key, { name: e.target.value })} />
            <div className="m-field-row">
              <input type="number" inputMode="decimal" aria-label="Prix du supplément en euros" placeholder="+ prix (€)" min={0} step="0.01" value={a.priceEuros} onChange={(e) => updateAddon(a.key, { priceEuros: e.target.value })} />
              <input type="number" inputMode="numeric" aria-label="Durée du supplément en minutes" placeholder="+ durée (min)" min={0} max={240} value={a.durationMinutes} onChange={(e) => updateAddon(a.key, { durationMinutes: e.target.value })} />
              <button type="button" className="m-round-btn" aria-label="Retirer ce supplément" onClick={() => setForm((f) => ({ ...f, addons: f.addons.filter((x) => x.key !== a.key) }))}>
                <Icon name="close" size={16} />
              </button>
            </div>
          </div>
        ))}
        <button type="button" className="m-btn m-btn-block" onClick={() => setForm((f) => ({ ...f, addons: [...f.addons, newAddon()] }))}>+ Ajouter un supplément</button>
      </div>
      {service && <button type="button" className="m-link m-link-danger" onClick={remove}>Supprimer la prestation</button>}
    </Sheet>
  );
}

function CategoriesSheet({ categories, setCategories, onClose }) {
  const confirm = useConfirm();
  const showToast = useToast();
  const [newName, setNewName] = useState('');
  const [newParent, setNewParent] = useState('');
  const tree = orderedCategoryTree(categories);
  const topLevel = tree.filter((c) => c.depth === 0);

  async function add(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      const created = await apiFetch('/admin/service-categories', {
        method: 'POST',
        body: newParent ? { name: newName.trim(), parentId: Number(newParent) } : { name: newName.trim() },
      });
      setCategories((cats) => [...cats, created]);
      setNewName('');
    } catch (err) {
      showToast(err.message, 'error');
    }
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

  async function move(cat, direction) {
    const siblings = tree.filter((c) => (c.parent_id ?? null) === (cat.parent_id ?? null));
    const index = siblings.findIndex((c) => c.id === cat.id);
    const target = siblings[index + direction];
    if (!target) return;
    try {
      const [a, b] = await Promise.all([
        apiFetch(`/admin/service-categories/${cat.id}`, { method: 'PATCH', body: { sortOrder: target.sort_order } }),
        apiFetch(`/admin/service-categories/${target.id}`, { method: 'PATCH', body: { sortOrder: cat.sort_order } }),
      ]);
      setCategories((cats) => cats.map((c) => (c.id === a.id ? a : c.id === b.id ? b : c)));
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function remove(cat) {
    if (!(await confirm(`Supprimer la catégorie « ${cat.name} » ?`))) return;
    try {
      await apiFetch(`/admin/service-categories/${cat.id}`, { method: 'DELETE' });
      setCategories((cats) => cats.filter((c) => c.id !== cat.id));
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  return (
    <Sheet title="Catégories" onClose={onClose} right={{ label: 'OK', onClick: onClose }} tall>
      <p className="m-hint">L'ordre ici est celui du site et du formulaire de réservation. Touchez un nom pour le renommer.</p>
      <div className="m-card m-list">
        {tree.map((cat) => {
          const siblings = tree.filter((c) => (c.parent_id ?? null) === (cat.parent_id ?? null));
          const index = siblings.findIndex((c) => c.id === cat.id);
          return (
            <div key={cat.id} className={`m-list-item m-cat-row ${cat.depth ? 'is-sub' : ''}`}>
              <input
                type="text"
                aria-label={`Nom de la catégorie ${cat.name}`}
                defaultValue={cat.name}
                maxLength={60}
                onBlur={(e) => e.target.value !== cat.name && rename(cat.id, e.target.value)}
              />
              <button type="button" className="m-round-btn" aria-label={`Monter ${cat.name}`} disabled={index === 0} onClick={() => move(cat, -1)}>↑</button>
              <button type="button" className="m-round-btn" aria-label={`Descendre ${cat.name}`} disabled={index === siblings.length - 1} onClick={() => move(cat, 1)}>↓</button>
              <button type="button" className="m-round-btn m-danger-text" aria-label={`Supprimer ${cat.name}`} onClick={() => remove(cat)}><Icon name="trash" size={16} /></button>
            </div>
          );
        })}
      </div>
      <form className="m-card m-card-pad" onSubmit={add}>
        <div className="m-field">
          <label htmlFor="m-cat-new">Nouvelle catégorie</label>
          <input id="m-cat-new" type="text" maxLength={60} placeholder="Ex : Homme" value={newName} onChange={(e) => setNewName(e.target.value)} />
        </div>
        <div className="m-field">
          <label htmlFor="m-cat-parent">Dans</label>
          <select id="m-cat-parent" value={newParent} onChange={(e) => setNewParent(e.target.value)}>
            <option value="">— Catégorie principale —</option>
            {topLevel.map((c) => <option key={c.id} value={c.id}>Sous-catégorie de {c.name}</option>)}
          </select>
        </div>
        <button type="submit" className="m-btn m-btn-block">Ajouter</button>
      </form>
    </Sheet>
  );
}

// Prestations : univers (Coiffure, Ongles…) puis sous-catégories ; chaque
// prestation s'ouvre dans un panneau de modification.
export default function PrestationsScreen({ onBack }) {
  const [services, setServices] = useState(null);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState(null);
  const [root, setRoot] = useState(null);
  const [sub, setSub] = useState('all');
  const [editing, setEditing] = useState(null); // service, 'new', or null
  const [catsOpen, setCatsOpen] = useState(false);

  useEffect(() => {
    Promise.all([apiFetch('/admin/services'), apiFetch('/admin/service-categories')])
      .then(([s, c]) => {
        setServices(s);
        setCategories(c);
      })
      .catch((err) => setError(err.message));
  }, []);

  const tree = orderedCategoryTree(categories);
  const roots = tree.filter((c) => c.depth === 0);
  const activeRoot = roots.find((c) => c.id === root) ?? roots[0];
  const subs = activeRoot ? tree.filter((c) => c.parent_id === activeRoot.id) : [];
  const groups = activeRoot
    ? [activeRoot, ...subs].filter((c) => sub === 'all' || c.id === sub).map((c) => ({ cat: c, items: (services ?? []).filter((s) => s.category_id === c.id) }))
    : [];

  return (
    <div className="m-screen">
      <TopBar title="Prestations" back={{ label: 'Plus', onClick: onBack }} action={{ label: 'Catégories', onClick: () => setCatsOpen(true) }}>
        {roots.length > 0 && (
          <Chips
            label="Univers"
            value={activeRoot?.id}
            onChange={(id) => {
              setRoot(id);
              setSub('all');
            }}
            options={roots.map((c) => ({ value: c.id, label: c.name }))}
          />
        )}
        {subs.length > 0 && (
          <Chips
            label="Sous-catégorie"
            value={sub}
            onChange={setSub}
            options={[{ value: 'all', label: 'Tout' }, ...subs.map((c) => ({ value: c.id, label: c.name }))]}
          />
        )}
      </TopBar>
      {error && <ErrorText>{error}</ErrorText>}
      {!error && !services && <Loading />}
      {services && roots.length === 0 && <Empty>Créez d'abord une catégorie (bouton « Catégories »).</Empty>}
      {groups.map(({ cat, items }) =>
        items.length === 0 && cat.depth === 0 && subs.length > 0 ? null : (
          <section key={cat.id} className="m-section">
            <h2 className="m-eyebrow">{cat.name}</h2>
            {items.length === 0 ? (
              <Empty>Aucune prestation.</Empty>
            ) : (
              <div className="m-card m-list">
                {items.map((s) => (
                  <button key={s.id} type="button" className="m-list-item m-svc-row" onClick={() => setEditing(s)}>
                    <span className="m-grow">
                      <strong className="m-ellipsis">{s.name}</strong>
                      <span className="m-muted m-ellipsis">
                        {formatDuration(s.duration_minutes)}
                        {s.addons?.length ? ` · ${s.addons.length} supplément${s.addons.length > 1 ? 's' : ''}` : ''}
                      </span>
                    </span>
                    {!s.active && <Badge tone="ko">Inactive</Badge>}
                    <strong>{formatPrice(s.price_cents)}</strong>
                    <Icon name="next" size={18} />
                  </button>
                ))}
              </div>
            )}
          </section>
        ),
      )}

      <Fab label="Ajouter une prestation" onClick={() => setEditing('new')} />

      {editing && (
        <ServiceSheet
          service={editing === 'new' ? null : editing}
          categories={categories}
          defaultCategoryId={sub !== 'all' ? sub : activeRoot?.id}
          onClose={() => setEditing(null)}
          onSaved={(saved, created) => {
            setServices((rows) => (created ? [...rows, saved] : rows.map((s) => (s.id === saved.id ? saved : s))));
            setEditing(null);
          }}
          onDeleted={(id) => {
            setServices((rows) => rows.filter((s) => s.id !== id));
            setEditing(null);
          }}
        />
      )}
      {catsOpen && <CategoriesSheet categories={categories} setCategories={setCategories} onClose={() => setCatsOpen(false)} />}
    </div>
  );
}
