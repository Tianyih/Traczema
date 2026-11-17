import { HashRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { CalendarPage } from '@/pages/CalendarPage';
import { PlaceholderPage } from '@/pages/PlaceholderPage';

/** HashRouter: a static, local-first app needs no server-side route rewrites. */
export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<CalendarPage />} />
          <Route path="body" element={<PlaceholderPage titleKey="nav_body" />} />
          <Route path="analytics" element={<PlaceholderPage titleKey="nav_analytics" />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
