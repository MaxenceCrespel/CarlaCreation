import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../../api/client';
import { useConfirm } from '../../../context/ConfirmContext';
import { useToast } from '../../../context/ToastContext';
import { AddReservationForm, ClientMatchModal, EditReservationModal } from '../ReservationsTab';
import { Icon, Sheet } from './ui';
import { todayStr } from './helpers';
import TodayScreen from './TodayScreen';
import AgendaScreen from './AgendaScreen';
import RdvSheet from './RdvSheet';
import ClientsScreen from './ClientsScreen';
import FicheScreen from './FicheScreen';
import MoreScreen from './MoreScreen';
import DispoScreen from './DispoScreen';
import MessagesScreen from './MessagesScreen';
import AvisScreen from './AvisScreen';
import PrestationsScreen from './PrestationsScreen';
import GalerieScreen from './GalerieScreen';
import PromosScreen from './PromosScreen';
import FactuScreen from './FactuScreen';
import DepensesScreen from './DepensesScreen';
import StockScreen from './StockScreen';
import ChiffresScreen from './ChiffresScreen';
import ReglagesScreen from './ReglagesScreen';
import '../../../styles/admin-mobile.css';

// Phone version of the admin (see AdminApp: shown under 760px wide). Same
// API and same business rules as the desktop tabs, laid out for one hand:
// a bottom tab bar (Aujourd'hui, Agenda, Clientes, Plus), bottom sheets
// instead of modals, and big touch targets.
//
// The current screen lives in the URL hash (#/agenda, #/clients/12,
// #/plus/messages…) so the phone's back gesture and a page reload both
// land where expected.

function readRoute() {
  return window.location.hash.replace(/^#\/?/, '') || 'today';
}

function useHashRoute() {
  const [route, setRoute] = useState(readRoute);

  useEffect(() => {
    const sync = () => setRoute(readRoute());
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, []);

  const go = useCallback((next, { replace = false } = {}) => {
    const url = `${window.location.pathname}${window.location.search}#/${next}`;
    if (replace) window.history.replaceState({ mobileAdmin: true }, '', url);
    else window.history.pushState({ mobileAdmin: true }, '', url);
    setRoute(next);
    window.scrollTo(0, 0);
  }, []);

  // Back from a sub-screen: a real history step when we pushed it ourselves
  // (keeps the back gesture consistent), otherwise jump to the parent.
  const back = useCallback(
    (parent) => {
      if (window.history.state?.mobileAdmin) window.history.back();
      else go(parent, { replace: true });
    },
    [go],
  );

  return [route, go, back];
}

const TABS = [
  { key: 'today', label: "Aujourd'hui", icon: 'home' },
  { key: 'agenda', label: 'Agenda', icon: 'calendar' },
  { key: 'clients', label: 'Clientes', icon: 'users' },
  { key: 'plus', label: 'Plus', icon: 'menu' },
];

export default function MobileAdmin({ username, onLogout, onCredentialsUpdated }) {
  const confirm = useConfirm();
  const showToast = useToast();
  const [route, go, back] = useHashRoute();
  const [reservations, setReservations] = useState(null);
  const [reservationsError, setReservationsError] = useState(null);
  const [counts, setCounts] = useState({ messages: 0, reviews: 0, lowStock: 0, unpaidInvoices: 0, unpaidCents: 0 });
  const [agenda, setAgenda] = useState({ mode: 'day', day: todayStr() });
  const [detailId, setDetailId] = useState(null);
  const [newRdv, setNewRdv] = useState(null); // initial form values, or null
  const [editTarget, setEditTarget] = useState(null);
  const [matchTarget, setMatchTarget] = useState(null);

  const [section, param, sub] = route.split('/');
  const activeTab = section === 'plus' ? 'plus' : TABS.some((t) => t.key === section) ? section : 'today';

  const loadReservations = useCallback(() => {
    setReservationsError(null);
    return apiFetch('/reservations')
      .then(setReservations)
      .catch((err) => setReservationsError(err.message));
  }, []);

  // Badge counts for the tab bar, "Aujourd'hui" and the "Plus" menu —
  // one request per list, refreshed whenever a screen changes something.
  const loadCounts = useCallback(() => {
    Promise.allSettled([
      apiFetch('/admin/contact-messages'),
      apiFetch('/admin/conversations'),
      apiFetch('/admin/reviews'),
      apiFetch('/admin/products'),
      apiFetch('/admin/invoices'),
    ]).then(([messages, conversations, reviews, products, invoices]) => {
      const list = (r) => (r.status === 'fulfilled' ? r.value : []);
      const unpaid = list(invoices).filter((i) => i.status !== 'paid');
      setCounts({
        messages: list(messages).filter((m) => !m.is_read).length + list(conversations).reduce((sum, c) => sum + c.unread, 0),
        reviews: list(reviews).filter((r) => r.status === 'pending').length,
        lowStock: list(products).filter((p) => p.low_stock_threshold > 0 && p.quantity <= p.low_stock_threshold).length,
        unpaidInvoices: unpaid.length,
        unpaidCents: unpaid.reduce((sum, i) => sum + i.total_cents, 0),
      });
    });
  }, []);

  useEffect(() => {
    loadReservations();
    loadCounts();
  }, [loadReservations, loadCounts]);

  // ---- Reservation actions, shared by Aujourd'hui, Agenda and the detail sheet

  function patchLocal(predicate, patch) {
    setReservations((rows) => (rows ?? []).map((r) => (predicate(r) ? { ...r, ...patch } : r)));
  }

  async function updateStatus(id, status, successText = 'Statut mis à jour.') {
    try {
      const res = await apiFetch(`/reservations/${id}/status`, { method: 'PATCH', body: { status } });
      patchLocal((r) => r.id === id, { status });
      showToast(res?.paymentWarning || successText, res?.paymentWarning ? 'error' : 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function accept(id) {
    await updateStatus(id, 'confirmed', 'Rendez-vous confirmé.');
  }

  async function refuse(id) {
    const ok = await confirm({
      title: 'Refuser cette demande ?',
      message: "La cliente en sera informée par email. Si elle a payé en ligne, l'autorisation sur sa carte est annulée (aucun débit).",
      confirmLabel: 'Refuser',
    });
    if (ok) await updateStatus(id, 'refused', 'Demande refusée.');
  }

  async function cancel(id) {
    const ok = await confirm({
      title: 'Annuler ce rendez-vous ?',
      message: 'Le rendez-vous passe en « annulé ».',
      confirmLabel: 'Annuler le rendez-vous',
      cancelLabel: 'Garder',
    });
    if (ok) await updateStatus(id, 'cancelled', 'Rendez-vous annulé.');
  }

  async function refuseGroup(groupId) {
    const ok = await confirm({
      title: 'Refuser tout le groupe ?',
      message: 'Toutes les personnes du rendez-vous groupé sont refusées et la cliente en est informée par email.',
      confirmLabel: 'Tout refuser',
    });
    if (!ok) return;
    try {
      const res = await apiFetch(`/reservations/group/${groupId}/status`, { method: 'PATCH', body: { status: 'refused' } });
      patchLocal((r) => r.group_id === groupId, { status: 'refused' });
      showToast(res?.paymentWarning || 'Groupe refusé.', res?.paymentWarning ? 'error' : 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function setPaidOnSite(groupId, paid) {
    try {
      await apiFetch(`/reservations/group/${groupId}/paid-on-site`, { method: 'PATCH', body: { paid } });
      patchLocal((r) => r.group_id === groupId, { paid_on_site: paid });
      showToast(paid ? 'Marqué comme réglé.' : 'Marqué comme non réglé.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function remove(r, wholeGroup = false) {
    const willNotify = r.status === 'pending' || r.status === 'confirmed';
    const ok = await confirm({
      title: wholeGroup ? 'Supprimer tout le groupe ?' : 'Supprimer ce rendez-vous ?',
      message: `${willNotify ? "La cliente recevra un email l'informant de l'annulation. " : ''}Cette action est irréversible.`,
      confirmLabel: 'Supprimer définitivement',
    });
    if (!ok) return;
    try {
      const res = wholeGroup
        ? await apiFetch(`/reservations/group/${r.group_id}`, { method: 'DELETE' })
        : await apiFetch(`/reservations/${r.id}`, { method: 'DELETE' });
      setReservations((rows) => rows.filter((x) => (wholeGroup ? x.group_id !== r.group_id : x.id !== r.id)));
      setDetailId(null);
      showToast(res?.paymentWarning || 'Rendez-vous supprimé.', res?.paymentWarning ? 'error' : 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function unlinkClient(id) {
    if (!(await confirm('Délier la fiche cliente de ce rendez-vous ?'))) return;
    try {
      await apiFetch('/admin/clients/unlink', { method: 'POST', body: { reservationId: id } });
      patchLocal((r) => r.id === id, { client_id: null });
      showToast('Fiche déliée.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  const rdv = {
    list: reservations,
    error: reservationsError,
    reload: loadReservations,
    open: (id) => setDetailId(id),
    accept,
    refuse,
    create: (initial = {}) => setNewRdv(initial),
  };

  const detail = detailId != null ? (reservations ?? []).find((r) => r.id === detailId) : null;

  function renderScreen() {
    if (section === 'agenda') {
      return <AgendaScreen rdv={rdv} state={agenda} setState={setAgenda} />;
    }
    if (section === 'clients' && param) {
      return <FicheScreen clientId={Number(param)} onBack={() => back('clients')} rdv={rdv} go={go} />;
    }
    if (section === 'clients') {
      return <ClientsScreen go={go} />;
    }
    if (section === 'plus' && param) {
      const common = { onBack: () => back('plus'), go, refreshCounts: loadCounts };
      switch (param.split('?')[0]) {
        case 'disponibilites': return <DispoScreen {...common} reservations={reservations} />;
        case 'messages': return <MessagesScreen {...common} onBack={() => back(sub ? 'plus/messages' : 'plus')} clientId={sub ? Number(sub) : null} onCreateRdv={rdv.create} />;
        case 'avis': return <AvisScreen {...common} />;
        case 'prestations': return <PrestationsScreen {...common} />;
        case 'galerie': return <GalerieScreen {...common} />;
        case 'promotions': return <PromosScreen {...common} />;
        case 'facturation': return <FactuScreen {...common} reservations={reservations} fromReservation={new URLSearchParams(param.split('?')[1] || '').get('rdv')} />;
        case 'depenses': return <DepensesScreen {...common} />;
        case 'stock': return <StockScreen {...common} />;
        case 'chiffres': return <ChiffresScreen {...common} />;
        case 'reglages': return <ReglagesScreen {...common} username={username} onLogout={onLogout} onCredentialsUpdated={onCredentialsUpdated} />;
        default: break;
      }
    }
    if (section === 'plus') {
      return <MoreScreen go={go} counts={counts} onLogout={onLogout} />;
    }
    return (
      <TodayScreen
        rdv={rdv}
        counts={counts}
        go={go}
        openAgendaDay={(day) => {
          setAgenda({ mode: 'day', day });
          go('agenda');
        }}
      />
    );
  }

  const pendingCount = (reservations ?? []).filter((r) => r.status === 'pending').length;
  const plusCount = counts.messages + counts.reviews + counts.lowStock + counts.unpaidInvoices;
  const tabBadges = { today: 0, agenda: pendingCount, clients: 0, plus: plusCount };
  const showFab = ['today', 'agenda', 'clients'].includes(section || 'today') && !param;

  return (
    <div className="m-admin">
      <main className="m-main">{renderScreen()}</main>

      {showFab && (
        <button
          type="button"
          className="m-fab"
          aria-label="Nouveau rendez-vous"
          onClick={() => rdv.create(section === 'agenda' ? { date: agenda.day } : {})}
        >
          <Icon name="plus" size={28} />
        </button>
      )}

      <nav className="m-tabbar" aria-label="Navigation principale">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`m-tab ${activeTab === t.key ? 'is-on' : ''}`}
            aria-current={activeTab === t.key ? 'page' : undefined}
            onClick={() => go(t.key)}
          >
            <Icon name={t.icon} />
            <span>{t.label}</span>
            {tabBadges[t.key] > 0 && <span className="m-tab-badge" aria-label={`${tabBadges[t.key]} à traiter`}>{tabBadges[t.key]}</span>}
          </button>
        ))}
      </nav>

      {detail && (
        <RdvSheet
          reservation={detail}
          reservations={reservations}
          onClose={() => setDetailId(null)}
          actions={{
            accept,
            refuse,
            cancel,
            refuseGroup,
            complete: (id) => updateStatus(id, 'completed', 'Rendez-vous terminé.'),
            setStatus: updateStatus,
            setPaidOnSite,
            remove,
            unlinkClient,
            edit: (r) => setEditTarget(r),
            linkClient: (r) => setMatchTarget(r),
            writeTo: (clientId) => {
              setDetailId(null);
              go(`plus/messages/${clientId}`);
            },
            openClient: (clientId) => {
              setDetailId(null);
              go(`clients/${clientId}`);
            },
            invoice: (r) => {
              setDetailId(null);
              go(`plus/facturation?rdv=${r.id}`);
            },
          }}
        />
      )}

      {newRdv && (
        <Sheet title="Nouveau rendez-vous" onClose={() => setNewRdv(null)} tall>
          <AddReservationForm
            initial={newRdv}
            onCreated={() => {
              setNewRdv(null);
              loadReservations();
            }}
            onCancel={() => setNewRdv(null)}
          />
        </Sheet>
      )}

      {editTarget && (
        <EditReservationModal
          reservation={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            loadReservations();
          }}
        />
      )}

      {matchTarget && (
        <ClientMatchModal
          reservation={matchTarget}
          onClose={() => setMatchTarget(null)}
          onLinked={(reservationId, clientId) => {
            patchLocal((r) => r.id === reservationId, { client_id: clientId });
            setMatchTarget(null);
          }}
        />
      )}
    </div>
  );
}
