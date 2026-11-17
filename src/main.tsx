import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DbProvider } from '@/hooks/useDb';
import { LanguageProvider } from '@/i18n/LanguageContext';
import { App } from './App';
import './index.css';

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <LanguageProvider>
      <DbProvider>
        <App />
      </DbProvider>
    </LanguageProvider>
  </StrictMode>,
);
