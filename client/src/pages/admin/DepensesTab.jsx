import { useEffect, useState } from 'react';
import { apiFetch } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { formatPrice } from '../../utils/format';

const CATEGORY_SUGGESTIONS = ['Produits', 'Loyer', 'Matériel', 'Assurance', 'Marketing', 'Autre'];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

const EMPTY_FORM = { expenseDate: todayStr(), category: '', description: '', amountEuros: '' };

function AddExpenseForm({ onCreated, onCancel }) {
  const showToast = useToast();
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const amountCents = Math.round(Number(form.amountEuros) * 100);
    if (!amountCents || amountCents <= 0) {
      showToast('Renseignez un montant.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const created = await apiFetch('/admin/expenses', {
        method: 'POST',
        body: {
          expenseDate: form.expenseDate,
          category: form.category.trim() || undefined,
          description: form.description.trim(),
          amountCents,
        },
      });
      onCreated(created);
      setForm({ ...EMPTY_FORM, expenseDate: form.expenseDate });
      showToast('Dépense ajoutée.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit} style={{ marginBottom: 24 }}>
      <h2>Ajouter une dépense</h2>
      <div className="form-row four-col">
        <div>
          <label htmlFor="expense-date">Date</label>
          <input type="date" id="expense-date" required value={form.expenseDate} onChange={update('expenseDate')} />
        </div>
        <div>
          <label htmlFor="expense-category">Catégorie</label>
          <input type="text" id="expense-category" list="expense-category-suggestions" maxLength={50} placeholder="Autre" value={form.category} onChange={update('category')} />
          <datalist id="expense-category-suggestions">
            {CATEGORY_SUGGESTIONS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div>
          <label htmlFor="expense-amount">Montant (€)</label>
          <input type="number" id="expense-amount" required min={0.01} step="0.01" value={form.amountEuros} onChange={update('amountEuros')} />
        </div>
        <div>
          <label htmlFor="expense-description">Description (optionnel)</label>
          <input type="text" id="expense-description" maxLength={300} placeholder="Ex : vernis, loyer août…" value={form.description} onChange={update('description')} />
        </div>
      </div>
      <div className="manual-reservation-form-actions">
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Ajout…' : 'Ajouter'}
        </button>
        <button type="button" className="btn btn-outline" onClick={onCancel}>Annuler</button>
      </div>
    </form>
  );
}

function ExpenseRow({ expense, onSave, onRemove }) {
  const showToast = useToast();
  const [expenseDate, setExpenseDate] = useState(expense.expense_date);
  const [category, setCategory] = useState(expense.category);
  const [description, setDescription] = useState(expense.description);
  const [amountEuros, setAmountEuros] = useState((expense.amount_cents / 100).toFixed(2));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await onSave(expense.id, {
        expenseDate,
        category: category.trim() || 'Autre',
        description: description.trim(),
        amountCents: Math.round(Number(amountEuros) * 100) || 0,
      });
      showToast('Dépense mise à jour.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr>
      <td data-label="Date"><input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} /></td>
      <td data-label="Catégorie"><input type="text" value={category} maxLength={50} list="expense-category-suggestions" onChange={(e) => setCategory(e.target.value)} /></td>
      <td data-label="Description"><input type="text" value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} /></td>
      <td data-label="Montant"><input type="number" min={0.01} step="0.01" className="stock-price-input" value={amountEuros} onChange={(e) => setAmountEuros(e.target.value)} /></td>
      <td className="row-actions">
        <button type="button" className="save-btn" onClick={save} disabled={saving}>{saving ? '…' : 'Enregistrer'}</button>
        <button type="button" className="danger" onClick={() => onRemove(expense.id)}>Supprimer</button>
      </td>
    </tr>
  );
}

export default function DepensesTab() {
  const showToast = useToast();
  const [expenses, setExpenses] = useState(null);
  const [error, setError] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);

  function load() {
    setError(null);
    apiFetch('/admin/expenses')
      .then(setExpenses)
      .catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function saveExpense(id, patch) {
    const updated = await apiFetch(`/admin/expenses/${id}`, { method: 'PATCH', body: patch });
    setExpenses((rows) => rows.map((e) => (e.id === id ? updated : e)));
  }

  async function removeExpense(id) {
    if (!window.confirm('Supprimer définitivement cette dépense ?')) return;
    try {
      await apiFetch(`/admin/expenses/${id}`, { method: 'DELETE' });
      setExpenses((rows) => rows.filter((e) => e.id !== id));
      showToast('Dépense supprimée.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  const totalCents = (expenses ?? []).reduce((sum, e) => sum + e.amount_cents, 0);

  return (
    <>
      <datalist id="expense-category-suggestions">
        {CATEGORY_SUGGESTIONS.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      {!showAddForm && (
        <button type="button" className="btn btn-primary btn-sm" style={{ marginBottom: 24 }} onClick={() => setShowAddForm(true)}>
          + Ajouter une dépense
        </button>
      )}

      {showAddForm && (
        <AddExpenseForm
          onCreated={(created) => {
            setExpenses((rows) => [created, ...(rows ?? [])]);
            setShowAddForm(false);
          }}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {expenses !== null && expenses.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h2 style={{ marginBottom: 0 }}>Total des dépenses enregistrées : {formatPrice(totalCents)}</h2>
        </div>
      )}

      {error && <p className="loading-text">Erreur : {error}</p>}
      {!error && expenses === null && <p className="loading-text">Chargement…</p>}
      {!error && expenses !== null && expenses.length === 0 && <p className="loading-text">Aucune dépense pour le moment.</p>}

      {!error && expenses !== null && expenses.length > 0 && (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Catégorie</th>
                <th>Description</th>
                <th>Montant</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <ExpenseRow key={e.id} expense={e} onSave={saveExpense} onRemove={removeExpense} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
