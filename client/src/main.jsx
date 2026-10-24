import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App.jsx';
import { SiteConfigProvider } from './context/SiteConfigContext';
import { ToastProvider } from './context/ToastContext';
import { ConfirmProvider } from './context/ConfirmContext';
import FrenchFormValidation from './components/FrenchFormValidation';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <SiteConfigProvider>
        <ToastProvider>
          <ConfirmProvider>
            <FrenchFormValidation />
            <App />
          </ConfirmProvider>
        </ToastProvider>
      </SiteConfigProvider>
    </BrowserRouter>
  </StrictMode>,
);
