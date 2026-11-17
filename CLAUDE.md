# CLAUDE.md - Eczema Condition & Trigger Analytics Web App

## Tech Stack
- Framework: React 18+ with TypeScript and Vite (or Next.js App Router)
- Styling: Tailwind CSS + shadcn/ui components + Lucide icons
- Local Persistence: IndexedDB via `dexie` (must support storing daily logs, body-part episode logs, and local image Blobs/DataURLs without backend dependency)
- Charts & Analytics: `recharts` for time-series and bidirectional correlation distributions
- Date Manipulation: `date-fns`

## Core Architecture Rules
1. Never ask the user to manually type calculated temporal fields (`beddingDaysSinceWash`, `daysAffected`, `isRecurrence`). Always derive them deterministically from historical timestamps and state transitions.
2. Separate the data layer (`src/db/`), statistical correlation engine (`src/lib/analytics/`), and UI components (`src/components/`).
3. Include a deterministic 60-day realistic mock data generator (`src/lib/mockData.ts`) with planted statistical correlations (e.g., high sweat + hot shower -> flare-up 24h later; unwashed bedding > 10 days -> neck/limb flare-up) so analytics charts can be verified immediately.

## Verification Commands
- Typecheck: `npm run typecheck` (or `tsc --noEmit`)
- Build check: `npm run build`
- Unit tests for analytics engine: `npx vitest run`

## Internationalization (Bilingual EN / ZH-CN)
- Implement a lightweight, strongly-typed i18n system (`src/i18n/en.ts`, `src/i18n/zh.ts`, and a `LanguageContext` with `t(key)` helper) plus a persistent `EN / 中文` toggle button in the top header.
- Store strictly language-agnostic canonical keys (e.g., `dairy`, `sweat_heavy`, `antecubital_fossa`, `hyperpigmentation`) in IndexedDB and the correlation engine; resolve display labels exclusively at the UI layer via `t()`.
- Synchronize `date-fns` locales (`enUS` and `zhCN`) with the active language state for calendar headers and date formatting.
- Ensure `zh.ts` satisfies the exact TypeScript type `typeof en` so `npm run typecheck` enforces 100% translation key parity.
