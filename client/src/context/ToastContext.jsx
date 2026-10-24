import { createContext, useCallback, useContext, useRef, useState } from 'react';

const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setToast(null), type === 'error' ? 6500 : 4500);
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div className={`toast ${toast ? 'is-visible' : ''} ${toast ? `is-${toast.type}` : ''}`} role="alert" aria-live="assertive">
        {toast && (
          <>
            <svg className="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {toast.type === 'error' ? (
                <>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v6M12 16.5v.5" />
                </>
              ) : (
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              )}
            </svg>
            <span className="toast-text">{toast.message}</span>
            <button type="button" className="toast-close" aria-label="Fermer" onClick={() => setToast(null)}>×</button>
          </>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
