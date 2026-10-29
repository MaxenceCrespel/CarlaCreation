import { useEffect, useState } from 'react';
import { apiFetch } from '../../../api/client';
import { useConfirm } from '../../../context/ConfirmContext';
import { useToast } from '../../../context/ToastContext';
import { formatPrice } from '../../../utils/format';
import { Badge, Empty, ErrorText, Fab, Loading, Sheet, Switch, TopBar } from './ui';

const PERCENTS = [5, 10, 15, 20, 30];

function PromoSheet({ promotion, onClose, onSaved, onDeleted }) {
  const confirm = useConfirm();
  const showToast = useToast();
  const isNew = !promotion;
  const [label, setLabel] = useState(promotion?.label ?? '');
  const [percent, setPercent] = useState(String(promotion?.discount_percent ?? 10));
  const [requiresCode, setRequiresCode] = useState(promotion?.requires_code ?? false);
  const [code, setCode] = useState(promotion?.code ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!label.trim()) return showToast('Le libellé est requis.', 'error');
    if (requiresCode && !code.trim()) return showToast('Un code est requis pour ce type de promotion.', 'error');
    const discountPercent = Math.min(100, Math.max(1, Number(percent) || 1));
    setSaving(true);
    try {
      const saved = isNew
        ? await apiFetch('/admin/promotions', {
            method: 'POST',
            body: { label: label.trim(), discountPercent, requiresCode, code: requiresCode ? code.trim() : undefined },
          })
        : await apiFetch(`/admin/promotions/${promotion.id}`, {
            method: 'PATCH',
            body: { label: label.trim(), discountPercent, ...(promotion.requires_code ? { code: code.trim() } : {}) },
          });
      showToast(isNew ? 'Promotion créée.' : 'Promotion mise à jour.', 'success');
      onSaved(saved, isNew);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!(await confirm('Supprimer définitivement cette promotion ?'))) return;
    try {
      await apiFetch(`/admin/promotions/${promotion.id}`, { method: 'DELETE' });
      showToast('Promotion supprimée.', 'success');
      onDeleted(promotion.id);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  return (
    <Sheet
      title={isNew ? 'Nouvelle promotion' : 'Modifier'}
      onClose={onClose}
      left={{ label: 'Annuler', onClick: onClose }}
      right={{ label: saving ? '…' : isNew ? 'Créer' : 'OK', onClick: save, disabled: saving }}
    >
      <div className="m-field">
        <label htmlFor="m-promo-label">Libellé</label>
        <input id="m-promo-label" type="text" maxLength={100} placeholder="Ex : Tarif étudiant" value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>
      <div className="m-field">
        <span className="m-label">Réduction</span>
        <div className="m-percents">
          {PERCENTS.map((p) => (
            <button key={p} type="button" aria-pressed={Number(percent) === p} className={`m-percent ${Number(percent) === p ? 'is-on' : ''}`} onClick={() => setPercent(String(p))}>
              {p} %
            </button>
          ))}
          <input type="number" inputMode="numeric" aria-label="Autre pourcentage" min={1} max={100} value={percent} onChange={(e) => setPercent(e.target.value)} />
        </div>
      </div>
      {isNew ? (
        <div className="m-switch-row m-field">
          <span>
            <strong className="m-block">Nécessite un code</strong>
            <span className="m-muted m-small">
              {requiresCode ? 'La cliente doit saisir le code exact en réservant.' : 'Sans code : la cliente choisit ce tarif dans un menu en réservant (ex : tarif étudiant).'}
            </span>
          </span>
          <Switch checked={requiresCode} label="Nécessite un code" onChange={setRequiresCode} />
        </div>
      ) : (
        <p className="m-muted m-small">{promotion.requires_code ? 'Code promo à saisir en réservant.' : 'Tarif proposé dans un menu au moment de réserver.'}</p>
      )}
      {requiresCode && (
        <div className="m-field">
          <label htmlFor="m-promo-code">Code</label>
          <input id="m-promo-code" type="text" maxLength={30} autoCapitalize="characters" className="m-mono" placeholder="Ex : BIENVENUE10" value={code} onChange={(e) => setCode(e.target.value)} />
        </div>
      )}
      {!isNew && <button type="button" className="m-link m-link-danger" onClick={remove}>Supprimer la promotion</button>}
    </Sheet>
  );
}

// Promotions : une ligne par promo avec son interrupteur ; les codes
// personnels (fidélité, anniversaire) sont listés à part.
export default function PromosScreen({ onBack }) {
  const confirm = useConfirm();
  const showToast = useToast();
  const [promotions, setPromotions] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    apiFetch('/admin/promotions').then(setPromotions).catch((err) => setError(err.message));
  }, []);

  async function toggle(p) {
    try {
      const updated = await apiFetch(`/admin/promotions/${p.id}`, { method: 'PATCH', body: { active: !p.active } });
      setPromotions((rows) => rows.map((x) => (x.id === p.id ? updated : x)));
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function removePersonal(p) {
    if (!(await confirm(`Supprimer le code ${p.code} ?`))) return;
    try {
      await apiFetch(`/admin/promotions/${p.id}`, { method: 'DELETE' });
      setPromotions((rows) => rows.filter((x) => x.id !== p.id));
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  const general = (promotions ?? []).filter((p) => p.client_id == null);
  const personal = (promotions ?? []).filter((p) => p.client_id != null);

  return (
    <div className="m-screen">
      <TopBar title="Promotions" back={{ label: 'Plus', onClick: onBack }} subtitle="Une seule promotion par réservation." />
      {error && <ErrorText>{error}</ErrorText>}
      {!error && !promotions && <Loading />}
      {promotions && general.length === 0 && <Empty>Aucune promotion. Créez-en une avec le bouton +.</Empty>}
      {general.length > 0 && (
        <div className="m-card m-list">
          {general.map((p) => (
            <div key={p.id} className="m-list-item m-promo-row">
              <button type="button" className={`m-plain m-promo-main ${p.active ? '' : 'is-off'}`} onClick={() => setEditing(p)}>
                <span className="m-promo-pct">−{p.discount_percent} %</span>
                <span className="m-grow">
                  <strong className="m-ellipsis">{p.label}</strong>
                  <span className="m-muted m-ellipsis">
                    {p.requires_code ? <span className="m-mono m-code">{p.code}</span> : 'Sans code'}
                    {p.active ? '' : ' · désactivée'}
                  </span>
                </span>
              </button>
              <Switch checked={p.active} label={`Activer ${p.label}`} onChange={() => toggle(p)} />
            </div>
          ))}
        </div>
      )}
      {general.length > 0 && <p className="m-hint">Touchez une promotion pour la modifier ou la supprimer.</p>}

      {personal.length > 0 && (
        <section className="m-section">
          <h2 className="m-eyebrow">Codes personnels (fidélité, anniversaire)</h2>
          <div className="m-card m-list">
            {personal.map((p) => {
              const state = p.used_at ? 'Utilisé' : p.expires_at && new Date(p.expires_at) < new Date() ? 'Expiré' : p.active ? 'Actif' : 'Désactivé';
              return (
                <div key={p.id} className="m-list-item m-promo-row">
                  <span className="m-grow">
                    <strong className="m-ellipsis">{p.label}</strong>
                    <span className="m-muted m-ellipsis"><span className="m-mono">{p.code}</span> · {p.discount_cents ? formatPrice(p.discount_cents) : `${p.discount_percent} %`}</span>
                  </span>
                  <Badge tone={state === 'Actif' ? 'ok' : 'neutral'}>{state}</Badge>
                  {!p.used_at && <Switch checked={p.active} label={`Activer le code ${p.code}`} onChange={() => toggle(p)} />}
                  <button type="button" className="m-link m-link-sm m-link-danger" onClick={() => removePersonal(p)}>Suppr.</button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <Fab label="Nouvelle promotion" onClick={() => setEditing('new')} />

      {editing && (
        <PromoSheet
          promotion={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(saved, created) => {
            setPromotions((rows) => (created ? [saved, ...rows] : rows.map((x) => (x.id === saved.id ? saved : x))));
            setEditing(null);
          }}
          onDeleted={(id) => {
            setPromotions((rows) => rows.filter((x) => x.id !== id));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
