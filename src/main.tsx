import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DbProvider } from '@/hooks/useDb';
import { DemoActionsProvider } from '@/hooks/useDemoActions';
import { LanguageProvider } from '@/i18n/LanguageContext';
import { App } from './App';
import './index.css';

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <LanguageProvider>
      <DbProvider>
        <DemoActionsProvider>
          <App />
        </DemoActionsProvider>
      </DbProvider>
    </LanguageProvider>
  </StrictMode>,
);
