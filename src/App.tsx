import { lazy, Suspense } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { CalendarPage } from '@/pages/CalendarPage';
import { PlaceholderPage } from '@/pages/PlaceholderPage';

// Route-level code splitting: the calendar paints first, other views load on demand.
const BodyPage = lazy(() => import('@/pages/BodyPage').then((m) => ({ default: m.BodyPage })));

/** HashRouter: a static, local-first app needs no server-side route rewrites. */
export function App() {
  return (
    <HashRouter>
      <Suspense fallback={null}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<CalendarPage />} />
            <Route path="body" element={<BodyPage />} />
            <Route path="analytics" element={<PlaceholderPage titleKey="nav_analytics" />} />
          </Route>
        </Routes>
      </Suspense>
    </HashRouter>
  );
}
