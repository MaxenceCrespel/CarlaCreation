import { useEffect, useState } from 'react';
import { apiFetch } from '../../../api/client';
import { useConfirm } from '../../../context/ConfirmContext';
import { useToast } from '../../../context/ToastContext';
import { formatPrice } from '../../../utils/format';
import { STATUS_LABELS } from '../reservationUtils';
import { ClientForm } from './ClientsScreen';
import { Badge, Empty, ErrorText, Icon, Loading, Segmented, TopBar } from './ui';
import { formatDayShort, initials, smsHref, STATUS_TONE, telHref } from './helpers';

function toForm(data) {
  return { name: data.name, phone: data.phone || '', birthdate: data.birthdate || '', notes: data.notes || '' };
}

// Fiche cliente : boutons de contact, infos modifiables sur place,
// historique des rendez-vous et factures émises au même nom.
export default function FicheScreen({ clientId, onBack, rdv }) {
  const confirm = useConfirm();
  const showToast = useToast();
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);
  const [form, setForm] = useState(null);
  const [tab, setTab] = useState('infos');
  const [saving, setSaving] = useState(false);
  const [invoices, setInvoices] = useState(null);

  useEffect(() => {
    setError(null);
    apiFetch(`/admin/clients/${clientId}`)
      .then((data) => {
        setDetail(data);
        setForm(toForm(data));
      })
      .catch((err) => setError(err.message));
    apiFetch('/admin/invoices').then(setInvoices).catch(() => setInvoices([]));
  }, [clientId]);

  const dirty = detail && form && JSON.stringify(form) !== JSON.stringify(toForm(detail));

  async function save() {
    if (!form.name.trim()) {
      showToast('Le nom est requis.', 'error');
      return;
    }
    setSaving(true);
    try {
      const updated = await apiFetch(`/admin/clients/${clientId}`, {
        method: 'PATCH',
        body: { name: form.name.trim(), phone: form.phone.trim(), notes: form.notes.trim(), birthdate: form.birthdate || undefined },
      });
      setDetail((d) => ({ ...d, ...updated }));
      setForm(toForm({ ...detail, ...updated }));
      showToast('Fiche mise à jour.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    const ok = await confirm({
      title: `Supprimer la fiche de ${detail.name} ?`,
      message: 'Ses points, codes et données personnelles sont effacés. Ses rendez-vous restent mais sont anonymisés (les factures émises sont conservées).',
      confirmLabel: 'Supprimer la fiche',
    });
    if (!ok) return;
    try {
      await apiFetch(`/admin/clients/${clientId}`, { method: 'DELETE' });
      showToast('Fiche supprimée.', 'success');
      onBack();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  const theirInvoices = (invoices ?? []).filter((i) => detail && i.client_name.trim().toLowerCase() === detail.name.trim().toLowerCase());

  return (
    <div className="m-screen">
      <TopBar
        back={{ label: 'Clientes', onClick: onBack }}
        action={dirty ? { label: saving ? 'Enregistrement…' : 'Enregistrer', onClick: save, disabled: saving } : null}
      />

      {error && <ErrorText>{error}</ErrorText>}
      {!error && !detail && <Loading />}

      {detail && form && (
        <>
          <div className="m-fiche-head">
            <span className="m-avatar m-avatar-lg" aria-hidden="true">{initials(detail.name)}</span>
            <h1 className="m-title">{detail.name}</h1>
            <p className="m-muted">
              {detail.history.length} rendez-vous · {detail.hasAccount ? 'compte en ligne créé' : 'pas de compte en ligne'}
            </p>
            <div className="m-actions-row">
              {detail.phone && <a className="m-action" href={telHref(detail.phone)}><Icon name="phone" />Appeler</a>}
              {detail.phone && <a className="m-action" href={smsHref(detail.phone)}><Icon name="sms" />SMS</a>}
              {detail.email && <a className="m-action" href={`mailto:${detail.email}`}><Icon name="mail" />Email</a>}
              <button
                type="button"
                className="m-action"
                onClick={() => rdv.create({ clientName: detail.name, clientPhone: detail.phone || '', clientEmail: detail.email || '' })}
              >
                <Icon name="calendarPlus" />Rendez-vous
              </button>
            </div>
          </div>

          <Segmented
            label="Section de la fiche"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'infos', label: 'Infos' },
              { value: 'history', label: `Historique · ${detail.history.length}` },
              { value: 'invoices', label: `Factures · ${theirInvoices.length}` },
            ]}
          />

          {tab === 'infos' && (
            <section className="m-section">
              <div className="m-card m-card-pad">
                <ClientForm form={form} setForm={setForm} idPrefix="m-fiche" />
                {detail.email && <p className="m-muted">Email : {detail.email}</p>}
                {detail.referral_code && <p className="m-muted">Code de parrainage : <strong>{detail.referral_code}</strong></p>}
                {dirty && (
                  <button type="button" className="m-btn m-btn-primary m-btn-block" onClick={save} disabled={saving}>
                    {saving ? 'Enregistrement…' : 'Enregistrer les modifications'}
                  </button>
                )}
              </div>
              <button type="button" className="m-link m-link-danger" onClick={remove}>Supprimer la fiche</button>
            </section>
          )}

          {tab === 'history' && (
            <section className="m-section">
              {detail.history.length === 0 ? (
                <Empty>Aucun rendez-vous lié à cette fiche.</Empty>
              ) : (
                <div className="m-card m-list">
                  {detail.history.map((h) => (
                    <div key={h.id} className="m-list-item">
                      <span className="m-grow">
                        <strong className="m-ellipsis">{h.service_name}</strong>
                        <span className="m-muted">{formatDayShort(h.reservation_date)} {h.reservation_date.slice(0, 4)} · {h.start_time}</span>
                      </span>
                      <Badge tone={STATUS_TONE[h.status]}>{STATUS_LABELS[h.status] || h.status}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {tab === 'invoices' && (
            <section className="m-section">
              {invoices === null && <Loading />}
              {invoices !== null && theirInvoices.length === 0 && <Empty>Aucune facture à ce nom.</Empty>}
              {theirInvoices.length > 0 && (
                <div className="m-card m-list">
                  {theirInvoices.map((i) => (
                    <a key={i.id} className="m-list-item" href={`/api/admin/invoices/${i.id}/pdf`} target="_blank" rel="noreferrer">
                      <span className="m-grow">
                        <strong className="m-mono">{i.number}</strong>
                        <span className="m-muted">{new Date(i.issue_date).toLocaleDateString('fr-FR')}</span>
                      </span>
                      <strong>{formatPrice(i.total_cents)}</strong>
                      <Badge tone={i.status === 'paid' ? 'ok' : 'ko'}>{i.status === 'paid' ? 'Payée' : 'Impayée'}</Badge>
                    </a>
                  ))}
                </div>
              )}
              <p className="m-hint">Factures retrouvées par le nom de la cliente. Touchez une facture pour ouvrir le PDF.</p>
            </section>
          )}
        </>
      )}
    </div>
  );
}
