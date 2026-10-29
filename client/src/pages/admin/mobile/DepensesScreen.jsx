import { useEffect, useState } from 'react';
import { apiFetch } from '../../../api/client';
import { useConfirm } from '../../../context/ConfirmContext';
import { useToast } from '../../../context/ToastContext';
import { formatPrice } from '../../../utils/format';
import { Badge, Empty, ErrorText, Fab, Loading, Sheet, TopBar } from './ui';
import { capitalize, formatDayLong, MONTH_NAMES, todayStr } from './helpers';

const CATEGORIES = ['Produits', 'Loyer', 'Matériel', 'Assurance', 'Marketing', 'Autre'];

function ExpenseSheet({ expense, onClose, onSaved, onDeleted }) {
  const confirm = useConfirm();
  const showToast = useToast();
  const isNew = !expense;
  const [amount, setAmount] = useState(expense ? (expense.amount_cents / 100).toFixed(2).replace('.', ',') : '');
  const [category, setCategory] = useState(expense?.category ?? 'Produits');
  const [description, setDescription] = useState(expense?.description ?? '');
  const [date, setDate] = useState(expense?.expense_date ?? todayStr());
  const [saving, setSaving] = useState(false);

  async function save() {
    const amountCents = Math.round(Number(String(amount).replace(',', '.')) * 100);
    if (!amountCents || amountCents <= 0) return showToast('Renseignez un montant.', 'error');
    const body = { expenseDate: date, category: category.trim() || 'Autre', description: description.trim(), amountCents };
    setSaving(true);
    try {
      const saved = isNew
        ? await apiFetch('/admin/expenses', { method: 'POST', body })
        : await apiFetch(`/admin/expenses/${expense.id}`, { method: 'PATCH', body });
      showToast(isNew ? 'Dépense ajoutée.' : 'Dépense mise à jour.', 'success');
      onSaved(saved, isNew);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!(await confirm('Supprimer définitivement cette dépense ?'))) return;
    try {
      await apiFetch(`/admin/expenses/${expense.id}`, { method: 'DELETE' });
      showToast('Dépense supprimée.', 'success');
      onDeleted(expense.id);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  const known = CATEGORIES.includes(category);

  return (
    <Sheet
      title={isNew ? 'Nouvelle dépense' : 'Dépense'}
      onClose={onClose}
      left={{ label: 'Annuler', onClick: onClose }}
      footer={
        <button type="button" className="m-btn m-btn-primary m-btn-block" disabled={saving} onClick={save}>
          {saving ? 'Enregistrement…' : isNew ? 'Ajouter la dépense' : 'Enregistrer'}
        </button>
      }
    >
      <label className="m-amount-input">
        <span className="m-visually-hidden">Montant en euros</span>
        <input type="text" inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <span aria-hidden="true">€</span>
      </label>
      <div className="m-percents m-center" role="group" aria-label="Catégorie">
        {CATEGORIES.map((c) => (
          <button key={c} type="button" aria-pressed={category === c} className={`m-percent ${category === c ? 'is-on' : ''}`} onClick={() => setCategory(c)}>{c}</button>
        ))}
      </div>
      {(!known || category === 'Autre') && (
        <div className="m-field">
          <label htmlFor="m-exp-cat">Catégorie personnalisée (optionnel)</label>
          <input id="m-exp-cat" type="text" maxLength={50} value={known ? '' : category} placeholder="Ex : Formation" onChange={(e) => setCategory(e.target.value || 'Autre')} />
        </div>
      )}
      <div className="m-field">
        <label htmlFor="m-exp-desc">Description (optionnel)</label>
        <input id="m-exp-desc" type="text" maxLength={300} placeholder="Ex : vernis, loyer août…" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="m-field">
        <label htmlFor="m-exp-date">Date</label>
        <input id="m-exp-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      {!isNew && <button type="button" className="m-link m-link-danger" onClick={remove}>Supprimer la dépense</button>}
    </Sheet>
  );
}

// Dépenses : total du mois, répartition par catégorie, liste par jour et
// ajout rapide (montant en gros, catégorie en un geste).
export default function DepensesScreen({ onBack }) {
  const [expenses, setExpenses] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    apiFetch('/admin/expenses').then(setExpenses).catch((err) => setError(err.message));
  }, []);

  const all = [...(expenses ?? [])].sort((a, b) => b.expense_date.localeCompare(a.expense_date));
  const month = todayStr().slice(0, 7);
  const monthRows = all.filter((e) => e.expense_date.slice(0, 7) === month);
  const monthTotal = monthRows.reduce((s, e) => s + e.amount_cents, 0);
  const total = all.reduce((s, e) => s + e.amount_cents, 0);
  const byCat = {};
  monthRows.forEach((e) => {
    byCat[e.category] = (byCat[e.category] || 0) + e.amount_cents;
  });
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const max = cats.length ? cats[0][1] : 1;

  const days = [];
  all.forEach((e) => {
    const last = days[days.length - 1];
    if (last && last.date === e.expense_date) last.rows.push(e);
    else days.push({ date: e.expense_date, rows: [e] });
  });

  return (
    <div className="m-screen">
      <TopBar title="Dépenses" back={{ label: 'Plus', onClick: onBack }}>
        <p className="m-big-number">
          <strong>{formatPrice(monthTotal)}</strong>
          <span className="m-muted"> en {MONTH_NAMES[Number(month.slice(5)) - 1]} · {formatPrice(total)} au total</span>
        </p>
      </TopBar>
      {error && <ErrorText>{error}</ErrorText>}
      {!error && !expenses && <Loading />}
      {cats.length > 0 && (
        <section className="m-card m-card-pad m-bars">
          <span className="m-eyebrow">Ce mois-ci par catégorie</span>
          {cats.map(([name, cents]) => (
            <div key={name} className="m-bar-row">
              <div className="m-line"><span>{name}</span><strong>{formatPrice(cents)}</strong></div>
              <div className="m-bar-track"><div className="m-bar-fill is-green" style={{ width: `${Math.max(4, Math.round((cents / max) * 100))}%` }} /></div>
            </div>
          ))}
        </section>
      )}
      {expenses && all.length === 0 && <Empty>Aucune dépense pour le moment.</Empty>}
      {days.map((d) => (
        <section key={d.date} className="m-section">
          <h2 className="m-section-title m-section-title-sm">{d.date === todayStr() ? "Aujourd'hui" : capitalize(formatDayLong(d.date))}{d.date.slice(0, 4) !== month.slice(0, 4) ? ` ${d.date.slice(0, 4)}` : ''}</h2>
          <div className="m-card m-list">
            {d.rows.map((e) => (
              <button key={e.id} type="button" className="m-list-item" onClick={() => setEditing(e)}>
                <span className="m-grow">
                  <strong className="m-ellipsis">{e.description || e.category}</strong>
                  <span><Badge>{e.category}</Badge></span>
                </span>
                <strong>{formatPrice(e.amount_cents)}</strong>
              </button>
            ))}
          </div>
        </section>
      ))}

      <Fab label="Ajouter une dépense" onClick={() => setEditing('new')} />

      {editing && (
        <ExpenseSheet
          expense={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(saved, created) => {
            setExpenses((rows) => (created ? [saved, ...rows] : rows.map((x) => (x.id === saved.id ? saved : x))));
            setEditing(null);
          }}
          onDeleted={(id) => {
            setExpenses((rows) => rows.filter((x) => x.id !== id));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
