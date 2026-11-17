import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import App from './App.jsx';
import { SiteConfigProvider } from './context/SiteConfigContext';
import { ToastProvider } from './context/ToastContext';
import { ConfirmProvider } from './context/ConfirmContext';
import { setServerPreload } from './utils/preload';

// Rendu HTML d'une page publique côté serveur (appelé par api/src/common/ssr.ts).
// `preload` : réponses de l'API déjà récupérées, par adresse (ex. '/services').
export function render(url, preload) {
  setServerPreload(preload);
  return renderToString(
    <StrictMode>
      <StaticRouter location={url}>
        <SiteConfigProvider>
          <ToastProvider>
            <ConfirmProvider>
              <App />
            </ConfirmProvider>
          </ToastProvider>
        </SiteConfigProvider>
      </StaticRouter>
    </StrictMode>,
  );
}
