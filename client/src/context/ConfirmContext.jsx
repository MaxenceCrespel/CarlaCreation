import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const ConfirmContext = createContext(() => Promise.resolve(false));

// Replaces the browser's native window.confirm() with the site's own modal.
// `confirm(message)` or `confirm({ title, message, confirmLabel, cancelLabel, danger })`
// resolves to true / false.
export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const resolverRef = useRef(null);
  const confirmButtonRef = useRef(null);

  const confirm = useCallback((options) => {
    // A short sentence becomes the dialog title; a long one is the explanation
    // under a generic title. The button label follows the verb ("Supprimer ...").
    let opts = options;
    if (typeof options === 'string') {
      const verb = ['Supprimer', 'Refuser', 'Délier', 'Régénérer'].find((v) => options.startsWith(v));
      opts = options.length > 70
        ? { message: options, confirmLabel: verb }
        : { title: options, message: '', confirmLabel: verb };
    }
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setDialog(opts);
    });
  }, []);

  const close = useCallback((result) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setDialog(null);
  }, []);

  useEffect(() => {
    if (!dialog) return undefined;
    confirmButtonRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') close(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog, close]);

  const danger = dialog ? dialog.danger !== false : true;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {dialog && (
        <div className="modal-overlay" onClick={() => close(false)}>
          <div className="modal-card confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="confirm-title">{dialog.title || 'Confirmer cette action ?'}</h2>
            {dialog.message && <p>{dialog.message}</p>}
            <button
              type="button"
              ref={confirmButtonRef}
              className={`btn btn-block ${danger ? 'btn-danger' : 'btn-primary'}`}
              onClick={() => close(true)}
            >
              {dialog.confirmLabel || 'Confirmer'}
            </button>
            <button type="button" className="btn btn-outline btn-block" onClick={() => close(false)}>
              {dialog.cancelLabel || 'Annuler'}
            </button>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmContext);
}
