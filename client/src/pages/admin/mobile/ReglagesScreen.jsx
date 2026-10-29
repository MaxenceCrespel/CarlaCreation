import { useEffect, useState } from 'react';
import { apiFetch } from '../../../api/client';
import PasswordInput from '../../../components/PasswordInput';
import { useConfirm } from '../../../context/ConfirmContext';
import { useToast } from '../../../context/ToastContext';
import { disablePushNotifications, enablePushNotifications, getExistingSubscription, pushSupported } from '../../../utils/push';
import { Icon, Loading, Switch, TopBar } from './ui';

let tierSeq = 0;

// Paliers de frais selon la distance réelle (« à partir de X km : Y € »),
// plus les valeurs de repli quand la distance est introuvable.
function TravelPage({ onBack }) {
  const showToast = useToast();
  const [minutes, setMinutes] = useState(null);
  const [fallback, setFallback] = useState(null);
  const [tiers, setTiers] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([apiFetch('/admin/settings/travel-buffer'), apiFetch('/admin/settings/travel-fee')])
      .then(([buffer, fee]) => {
        setMinutes(String(buffer.minutes));
        setFallback(String(fee.fallbackCents / 100));
        setTiers([...fee.tiers].sort((a, b) => a.minKm - b.minKm).map((t) => ({ key: (tierSeq += 1), minKm: String(t.minKm), fee: String(t.feeCents / 100) })));
      })
      .catch(() => showToast('Impossible de charger les réglages de trajet.', 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateTier = (key, patch) => setTiers((rows) => rows.map((t) => (t.key === key ? { ...t, ...patch } : t)));

  async function save() {
    if (!tiers.some((t) => Number(t.minKm) === 0)) {
      showToast('Il faut un palier à partir de 0 km (le rayon gratuit ou le premier tarif).', 'error');
      return;
    }
    setSaving(true);
    try {
      await Promise.all([
        apiFetch('/admin/settings/travel-buffer', { method: 'PUT', body: { minutes: Number(minutes) } }),
        apiFetch('/admin/settings/travel-fee/fallback', { method: 'PUT', body: { feeCents: Math.round(Number(fallback) * 100) } }),
        apiFetch('/admin/settings/travel-fee/tiers', {
          method: 'PUT',
          body: { tiers: tiers.map((t) => ({ minKm: Number(t.minKm), feeCents: Math.round(Number(t.fee) * 100) })) },
        }),
      ]);
      showToast('Réglages de trajet enregistrés.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="m-screen">
      <TopBar title="Déplacements" back={{ label: 'Réglages', onClick: onBack }} action={tiers ? { label: saving ? '…' : 'Enregistrer', onClick: save, disabled: saving } : null} />
      {!tiers ? (
        <Loading />
      ) : (
        <>
          <h2 className="m-eyebrow">Frais selon la distance</h2>
          <div className="m-card m-list">
            {tiers.map((t, i) => (
              <div key={t.key} className="m-list-item m-tier">
                <span>Dès</span>
                <input type="number" inputMode="decimal" aria-label={`Distance du palier ${i + 1} en km`} min={0} max={500} step={0.5} value={t.minKm} onChange={(e) => updateTier(t.key, { minKm: e.target.value })} />
                <span>km :</span>
                <input type="number" inputMode="decimal" aria-label={`Frais du palier ${i + 1} en euros`} min={0} max={100} step={0.5} value={t.fee} onChange={(e) => updateTier(t.key, { fee: e.target.value })} />
                <span>€</span>
                {tiers.length > 1 && (
                  <button type="button" className="m-round-btn" aria-label={`Retirer le palier ${i + 1}`} onClick={() => setTiers((rows) => rows.filter((x) => x.key !== t.key))}>
                    <Icon name="close" size={16} />
                  </button>
                )}
              </div>
            ))}
            <button type="button" className="m-list-item m-menu-item m-link-row" onClick={() => setTiers((rows) => [...rows, { key: (tierSeq += 1), minKm: '', fee: '' }])}>+ Ajouter un palier</button>
          </div>
          <p className="m-hint">Chaque palier s'applique à partir de sa distance. Exemple : « dès 0 km : 0 € » puis « dès 10 km : 2 € ». La cliente voit le rayon gratuit avant de saisir son adresse.</p>

          <h2 className="m-eyebrow">Si la distance ne peut pas être calculée</h2>
          <div className="m-card m-list">
            <label className="m-list-item m-tier">
              <span className="m-grow">Frais de repli</span>
              <input type="number" inputMode="decimal" min={0} max={100} step={0.5} value={fallback} onChange={(e) => setFallback(e.target.value)} />
              <span>€</span>
            </label>
            <label className="m-list-item m-tier">
              <span className="m-grow">Temps bloqué avant/après</span>
              <input type="number" inputMode="numeric" min={0} max={240} step={5} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
              <span>min</span>
            </label>
          </div>
          <p className="m-hint">Le vrai temps de trajet (calculé depuis l'adresse) est utilisé en priorité ; ces valeurs ne servent que si l'adresse n'est pas reconnue.</p>
          <button type="button" className="m-btn m-btn-primary m-btn-block" onClick={save} disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
        </>
      )}
    </div>
  );
}

function LoyaltyPage({ onBack }) {
  const showToast = useToast();
  const [percent, setPercent] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch('/admin/settings/loyalty')
      .then((data) => setPercent(data.birthdayDiscountPercent))
      .catch(() => showToast('Impossible de charger les réglages de fidélité.', 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    setSaving(true);
    try {
      await apiFetch('/admin/settings/loyalty/birthday-discount-percent', { method: 'PUT', body: { percent: Number(percent) } });
      showToast('Réglage enregistré.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="m-screen">
      <TopBar title="Fidélité" back={{ label: 'Réglages', onClick: onBack }} />
      {percent === null ? (
        <Loading />
      ) : (
        <>
          <h2 className="m-eyebrow">Cadeau d'anniversaire</h2>
          <div className="m-card m-list">
            <div className="m-list-item">
              <span className="m-grow">Réduction pendant le mois d'anniversaire</span>
              <div className="m-stepper is-small">
                <button type="button" aria-label="Diminuer" onClick={() => setPercent((p) => Math.max(0, Number(p) - 5))}>−</button>
                <span><strong>{percent} %</strong></span>
                <button type="button" aria-label="Augmenter" onClick={() => setPercent((p) => Math.min(100, Number(p) + 5))}>+</button>
              </div>
            </div>
          </div>
          <button type="button" className="m-btn m-btn-primary m-btn-block" onClick={save} disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
          <h2 className="m-eyebrow">Barème (fixe)</h2>
          <div className="m-card m-card-pad m-small-text">
            <p>1 point par tranche de 4 € dépensés, crédité quand le rendez-vous passe en « terminé ».</p>
            <p>À 50, 100, 150 et 250 points, la cliente échange ses points contre 5 €, 12 €, 20 € ou 35 € offerts (code personnel à usage unique).</p>
            <p>Parrainage : 20 points pour la marraine et 10 pour la filleule, au premier rendez-vous terminé de la filleule.</p>
            <p>Anniversaire : un code personnel valable 1 mois.</p>
          </div>
        </>
      )}
    </div>
  );
}

function AccountPage({ onBack, username, onCredentialsUpdated }) {
  const showToast = useToast();
  const [newUsername, setNewUsername] = useState(username);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    const usernameChanged = newUsername.trim() && newUsername.trim() !== username;
    const passwordChanged = next.length > 0;
    if (!usernameChanged && !passwordChanged) return showToast("Modifiez le nom d'utilisateur ou le mot de passe.", 'error');
    if (passwordChanged && next !== again) return showToast('La confirmation ne correspond pas au nouveau mot de passe.', 'error');
    if (passwordChanged && next.length < 10) return showToast('Le nouveau mot de passe doit faire au moins 10 caractères.', 'error');
    if (!current) return showToast('Le mot de passe actuel est requis.', 'error');
    setSaving(true);
    try {
      const data = await apiFetch('/auth/me', {
        method: 'PATCH',
        body: { currentPassword: current, newUsername: usernameChanged ? newUsername.trim() : undefined, newPassword: passwordChanged ? next : undefined },
      });
      onCredentialsUpdated(data.username);
      setCurrent('');
      setNext('');
      setAgain('');
      showToast('Identifiants mis à jour.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="m-screen">
      <TopBar title="Mon compte" back={{ label: 'Réglages', onClick: onBack }} action={{ label: saving ? '…' : 'Enregistrer', onClick: save, disabled: saving }} />
      <div className="m-card m-card-pad">
        <div className="m-field">
          <label htmlFor="m-acc-user">Nom d'utilisateur</label>
          <input id="m-acc-user" type="text" autoComplete="username" minLength={3} maxLength={100} value={newUsername} onChange={(e) => setNewUsername(e.target.value)} />
        </div>
        <div className="m-field">
          <label htmlFor="m-acc-new">Nouveau mot de passe (optionnel)</label>
          <PasswordInput id="m-acc-new" autoComplete="new-password" placeholder="Laisser vide pour ne pas changer" value={next} onChange={(e) => setNext(e.target.value)} />
        </div>
        <div className="m-field">
          <label htmlFor="m-acc-again">Confirmer le nouveau mot de passe</label>
          <PasswordInput id="m-acc-again" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
        </div>
        <div className="m-field">
          <label htmlFor="m-acc-current">Mot de passe actuel (obligatoire)</label>
          <PasswordInput id="m-acc-current" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </div>
        <button type="button" className="m-btn m-btn-primary m-btn-block" onClick={save} disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
      </div>
    </div>
  );
}

function NotificationsRow() {
  const showToast = useToast();
  const [status, setStatus] = useState('checking');
  const [working, setWorking] = useState(false);

  useEffect(() => {
    (async () => {
      if (!pushSupported()) return setStatus('unsupported');
      try {
        const { publicKey } = await apiFetch('/admin/push/public-key');
        if (!publicKey) return setStatus('unavailable');
        const subscription = await getExistingSubscription();
        if (!subscription) return setStatus('off');
        const { subscribed } = await apiFetch(`/admin/push/status?endpoint=${encodeURIComponent(subscription.endpoint)}`);
        setStatus(subscribed ? 'on' : 'off');
      } catch {
        setStatus('off');
      }
    })();
  }, []);

  async function toggle(on) {
    setWorking(true);
    try {
      if (on) await enablePushNotifications();
      else await disablePushNotifications();
      setStatus(on ? 'on' : 'off');
      showToast(on ? 'Notifications activées.' : 'Notifications désactivées.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setWorking(false);
    }
  }

  async function test() {
    try {
      await apiFetch('/admin/push/test', { method: 'POST' });
      showToast('Notification de test envoyée.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  if (status === 'unsupported' || status === 'unavailable') {
    return (
      <div className="m-list-item">
        <span className="m-grow">
          Notifications
          <span className="m-muted m-small m-block">
            {status === 'unsupported' ? "Pas disponibles sur ce navigateur. Sur iPhone : Safari → Partager → Sur l'écran d'accueil, puis rouvrez depuis l'icône." : 'Pas configurées côté serveur.'}
          </span>
        </span>
      </div>
    );
  }

  return (
    <>
      <div className="m-list-item">
        <span className="m-grow">
          Notifications sur ce téléphone
          <span className="m-muted m-small m-block">Nouvelle demande de rendez-vous (en plus de l'email)</span>
        </span>
        <Switch checked={status === 'on'} disabled={working || status === 'checking'} label="Notifications sur ce téléphone" onChange={toggle} />
      </div>
      {status === 'on' && (
        <button type="button" className="m-list-item m-menu-item m-link-row" onClick={test}>Envoyer une notification de test</button>
      )}
    </>
  );
}

function CalendarRows() {
  const confirm = useConfirm();
  const showToast = useToast();
  const [url, setUrl] = useState(undefined);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    apiFetch('/admin/calendar-token')
      .then((data) => setUrl(data.url))
      .catch(() => setUrl(null));
  }, []);

  async function generate() {
    if (url && !(await confirm("Régénérer le lien ? L'ancien arrêtera de se mettre à jour dans votre calendrier tant qu'il n'est pas remplacé par le nouveau."))) return;
    setWorking(true);
    try {
      const data = await apiFetch('/admin/calendar-token', { method: 'POST' });
      setUrl(data.url);
      showToast('Lien de calendrier généré.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setWorking(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      showToast('Lien copié.', 'success');
    } catch {
      showToast('Copie impossible : sélectionnez le lien et copiez-le à la main.', 'error');
    }
  }

  const webcal = url ? url.replace(/^https?:/, 'webcal:') : null;

  return (
    <>
      <div className="m-list-item">
        <span className="m-grow m-small">
          Vos rendez-vous s'affichent tout seuls dans le Calendrier de l'iPhone, Google Agenda ou Outlook (dans ce sens uniquement).
        </span>
      </div>
      {url === undefined && <div className="m-list-item"><span className="m-muted">Chargement…</span></div>}
      {url === null && (
        <button type="button" className="m-list-item m-menu-item m-link-row" onClick={generate} disabled={working}>
          {working ? 'Génération…' : "Créer mon lien d'abonnement"}
        </button>
      )}
      {url && (
        <>
          <a className="m-list-item m-menu-item m-link-row" href={webcal}>Ajouter au calendrier de ce téléphone</a>
          <button type="button" className="m-list-item m-menu-item m-link-row" onClick={copy}>Copier le lien</button>
          <button type="button" className="m-list-item m-menu-item m-danger-text" onClick={generate} disabled={working}>Régénérer le lien</button>
        </>
      )}
    </>
  );
}

// Réglages présentés comme ceux de l'iPhone : listes groupées, et une page
// par sujet pour ce qui demande plusieurs champs.
export default function ReglagesScreen({ onBack, go, username, onLogout, onCredentialsUpdated }) {
  const [page, setPage] = useState('home');

  if (page === 'travel') return <TravelPage onBack={() => setPage('home')} />;
  if (page === 'loyalty') return <LoyaltyPage onBack={() => setPage('home')} />;
  if (page === 'account') return <AccountPage onBack={() => setPage('home')} username={username} onCredentialsUpdated={onCredentialsUpdated} />;

  return (
    <div className="m-screen">
      <TopBar title="Réglages" back={{ label: 'Plus', onClick: onBack }} />
      <h2 className="m-eyebrow">Réservations</h2>
      <div className="m-card m-list">
        <button type="button" className="m-list-item m-menu-item" onClick={() => setPage('travel')}><span className="m-grow">Déplacements à domicile</span><Icon name="next" size={18} /></button>
        <button type="button" className="m-list-item m-menu-item" onClick={() => setPage('loyalty')}><span className="m-grow">Fidélité &amp; anniversaire</span><Icon name="next" size={18} /></button>
        <button type="button" className="m-list-item m-menu-item" onClick={() => go('plus/disponibilites')}><span className="m-grow">Disponibilités</span><Icon name="next" size={18} /></button>
      </div>

      <h2 className="m-eyebrow">Ce téléphone</h2>
      <div className="m-card m-list"><NotificationsRow /></div>

      <h2 className="m-eyebrow">Synchroniser mon calendrier</h2>
      <div className="m-card m-list"><CalendarRows /></div>

      <h2 className="m-eyebrow">Compte</h2>
      <div className="m-card m-list">
        <button type="button" className="m-list-item m-menu-item" onClick={() => setPage('account')}>
          <span className="m-grow">Identifiant et mot de passe</span>
          <span className="m-muted">{username}</span>
          <Icon name="next" size={18} />
        </button>
        <a className="m-list-item m-menu-item" href="/" target="_blank" rel="noopener noreferrer"><span className="m-grow">Voir le site</span><Icon name="external" size={18} /></a>
        <button type="button" className="m-list-item m-menu-item m-danger-text" onClick={onLogout}><span className="m-grow">Se déconnecter</span></button>
      </div>
    </div>
  );
}
