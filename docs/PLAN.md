# PriceHunt — Implementation Plan

Execute in order with `superpowers:subagent-driven-development`. Frontend tasks end with the `ui-visual-qa`
skill (`.claude/skills/ui-visual-qa`). Each task: implement → run "Done when" checks →
tick `[x]` → update `docs/AI-USAGE.md` → commit → push. Section refs (§) point to `docs/SPEC.md`.

---

## Phase 0 — Bootstrap

- [x] **T0.1 Repo hygiene & prerequisites**
  - Verify `dotnet --list-sdks` includes 10.x, `node -v` (LTS), `npm -v`, `git --version`. If .NET 10 or Node is missing,
    stop (the only allowed stop).
  - Confirm `origin` remote (if missing, continue locally).
  - Root `.gitignore`: .NET (`bin/ obj/ *.user .vs/`), Node/Angular (`node_modules/ dist/ .angular/`),
    `*.db *.db-shm *.db-wal`, Playwright (`test-results/ playwright-report/ blob-report/`), `docs/ui-qa/`, `.DS_Store`.
  - Done when: `.gitignore` committed; tool versions confirmed.

- [x] **T0.2 Scaffold the server** (§3, §4)
  - `server/global.json` (SDK 10, rollForward latestFeature), solution, `PriceHunt.Api` (`dotnet new webapi --use-controllers`),
    `PriceHunt.Tests` (xunit), project reference, packages (EF Core Sqlite + Design, OpenApi, Scalar, Mvc.Testing, TimeProvider.Testing).
  - Local tool manifest with `dotnet-ef`.
  - Remove template WeatherForecast. HTTP-only launch profile on 5080, no HTTPS redirection.
  - CORS policy for `http://localhost:4200`; camelCase + string enums JSON; ProblemDetails + global exception handler; OpenAPI + `/scalar` in Development.
  - Done when: `dotnet build server` and `dotnet test server` succeed; `GET http://localhost:5080/scalar` loads in Development.

- [x] **T0.3 Scaffold the client** (§3, §4, §11.1)
  - `npx @angular/cli@latest new client --routing --style=scss --ssr=false --skip-git` (non-interactive flags as needed).
  - `ng add @angular/material` (non-interactive). `environment.ts` with `apiBaseUrl`.
  - `package.json`: `"prestart": "npm install --no-audit --no-fund"`; `start` = `ng serve --port 4200`.
  - Dev dependencies for visual QA/E2E now (used from T2.1 on): `@playwright/test`, `@axe-core/playwright`;
    then `npx playwright install chromium`.
  - Done when: `npx ng build` succeeds, unit tests run green on the default spec, and
    `node ../.claude/skills/ui-visual-qa/scripts/capture-ui.mjs --help` (run from `client/`) prints usage and exits 0.

## Phase 1 — Backend

- [x] **T1.1 Location catalog & meta API** (§6)
  - `LocationCatalog` (33 entries exactly as in §6.1), `MetaController` (`/api/meta/locations`, `/api/meta/suppliers`), supplier options binding (§5.1).
  - Done when: unit tests for catalog lookup; integration test for both endpoints (shape + camelCase).

- [x] **T1.2 Simulated suppliers** (§5) — TDD
  - `ISupplierClient`, `SimulatedSupplier`, `SupplierOptions`, `SupplierRegistry`, `IRandomSource`, `SupplierUnavailableException`.
  - Done when: unit tests from §12 "Supplier" all pass using `FakeTimeProvider`.

- [x] **T1.3 Data layer** (§9)
  - Entities, `PriceHuntDbContext`, converters (enum→string, supplier list CSV + comparer), indexes, initial migration,
    startup `MigrateAsync` + WAL pragma, connection-string path resolution (§4).
  - Done when: API start from repo root creates `server/PriceHunt.Api/pricehunt.db` with both tables; test proves a fresh DB file is migrated.

- [x] **T1.4 Search orchestrator** (§8) — TDD
  - `SearchCriteria`, `SearchEvent` types, `SupplierOutcome`, `SearchOrchestrator.RunAsync` with linked tokens,
    `Task.WhenEach`, persistence per event, `finally` block finalization.
  - Done when: every orchestrator unit test in §12 passes (completion order, early Completed, TimedOut at 6 s,
    failure isolation, client cancel propagation + Cancelled persisted + no `end`, persisted fields correct).

- [x] **T1.5 Streaming endpoint** (§7)
  - `SearchController.Stream` with validation (§7.2) and SSE response (§7.3–7.4).
  - Done when: integration tests pass (incremental delivery, event order, 400s, disconnect → Cancelled in DB);
    manual `curl -N` smoke test shows events arriving one by one.

- [x] **T1.6 History API** (§10) — TDD
  - `HistoryQuery` binding + validation, `HistoryService` (IQueryable filter/sort/page), `HistoryController`.
  - Done when: all history unit tests from §12 pass; integration test reads rows created by a real search.

- [x] **T1.7 Demo seed** (§9.4)
  - `DemoDataSeeder` (deterministic), wired after migration, skipped when DB not empty or `SeedDemoData=false`.
  - Done when: fresh start produces ~40 searches / ~150 responses with realistic statuses; second start adds nothing; test covers both.

## Phase 2 — Frontend

- [x] **T2.1 Futuristic theme & shell** (§11.1, §11.2, §11.5)
  - Background (gradient, glow orbs, grid), glass + neumorphic tokens and utility classes, M3 dark theme +
    `_material-overrides.scss`, Space Grotesk + Inter, tabular-nums utility, glass top bar with pill tabs,
    lazy routes, responsive container, formatter pipes (price, date, date range, ms).
  - Build a temporary hidden `/styleguide` route (dev only, removed in T3.2) showing every control state
    (buttons raised/hover/pressed/disabled, chips, inputs, toggle, tags, badges, glass card) to tune the look early.
  - Done when: build passes; formatter unit tests pass; `ui-visual-qa` screenshots of the shell + styleguide score ≥ 4 on
    rubric criteria 1–4, 9, 10 at all three viewports (search/history automated checks may fail — screens not built yet).

- [x] **T2.2 Core services** (§11.3 SSE parser)
  - Models/types for all API DTOs and events; `MetaService` (cached); `SseParser` + `SearchStreamService` (fetch, abort on unsubscribe, problem-details errors); `HistoryService`.
  - Done when: SSE parser and date-serialization unit tests pass.

- [x] **T2.3 Search store** (§11.3 State & cancellation)
  - Root `SearchStore` with signals; `switchMap` pipeline; client token + `searchId` stale guard; binary sorted insert; supplier status map; status machine (idle → running → Completed/TimedOut/Cancelled/ConnectionLost); cancel().
  - Done when: store unit tests pass (sorted insert, ties, duplicates, stale events ignored, cancel, new search resets).

- [x] **T2.4 Search form** (§11.3 Form card)
  - Autocomplete From/To with catalog validator, swap button, date range picker (min today), supplier chips with Select all · Clear, strict validation messages, Search + Cancel buttons, form state kept in the store.
  - Done when: component tests for validation; a real search starts against the API; `ui-visual-qa --screens search`
    rubric ≥ 4 for the form at all viewports (automated failures allowed **only** for progress/results elements that
    T2.5–T2.6 build — list them in the report).

- [x] **T2.5 Progress panel & supplier status strip** (§11.3)
  - Counter text (aria-live), countdown, determinate bar, final badges, summary line, status chips with tooltips.
  - Done when: a default search shows the counter rising and ends "Timed out"; without G ends "Completed";
    `ui-visual-qa --screens search` rubric ≥ 4 for form + progress (automated failures allowed only for result cards, built in T2.6).

- [x] **T2.6 Ranked result cards & FLIP** (§11.3 Ranked result cards)
  - Card component, Cheapest badge, `flipList` directive, skeleton/empty states, reduced-motion support, phone sizing.
  - Done when: `ui-visual-qa --screens search` full PASS at all viewports (first full gate): 0 jumps, 0 flickers, 0 sort violations.

- [x] **T2.7 History screen** (§11.4)
  - Filters card (dates default today→+30, supplier multi-select, optional From/To, Show failures, Apply, Reset), URL query-param sync, server-side `mat-table` + `matSort` + `mat-paginator`, status tags, loading/empty/error states, phone row-card layout with Sort-by select.
  - Done when: URL⇄filter unit tests pass; seeded data, sorting by every column, paging, filters and Back/Forward work; `ui-visual-qa --screens history` PASS.

## Phase 3 — Verification, docs, delivery

- [x] **T3.1 Playwright E2E** (§12 E2E)
  - `playwright.config.ts` with `webServer` for API (e2e DB) and client; desktop + iPhone 13 projects; specs 1–7 (Playwright was installed in T0.3).
  - Done when: `npx playwright test` passes twice in a row.

- [x] **T3.2 Full visual QA & polish** (§11.5, §11.6)
  - Remove the `/styleguide` route. Run `ui-visual-qa` for both screens at all viewports; also check empty, error
    (stop the API), Cancelled and Timed out states by hand-made screenshots; fix everything the rubric flags.
  - Copy the final screenshots to `docs/screenshots/`.
  - Done when: `ui-visual-qa --screens search,history` PASS with every rubric item ≥ 4 everywhere; no console errors during E2E.

- [x] **T3.3 Fresh-clone check** (R21)
  - Clone the repo into a temp dir; run `dotnet run --project server/PriceHunt.Api` and `cd client && npm start` exactly as the README says; confirm both start with zero extra steps, DB is created and seeded, a search works end to end. Run all test suites from the clone.
  - Done when: all of the above succeed.

- [x] **T3.4 README** (§13)
  - All 10 sections, screenshots embedded, R1–R22 checklist with file/test references, AI-usage section from `docs/AI-USAGE.md`.
  - Done when: every section exists and every command in it was actually run successfully.

- [x] **T3.5 Final audit & release**
  - Re-read `docs/ActualInterviewInstructions.md` (the reviewers' brief) and SPEC §1–§2. Verify every checklist item
    B1–B31 against the running app, tests and README; write `docs/FINAL-AUDIT.md` (one row per item: status + evidence).
    Fix every gap, then re-verify.
  - Run `dotnet test server`, client unit tests, `npx playwright test` — all green.
  - `git tag v1.0.0`, push commits and tags.
  - Done when: `docs/FINAL-AUDIT.md` shows B1–B31 all ✅ with evidence, and CLAUDE.md §8 is fully met → output `<promise>PRICEHUNT_DONE</promise>`.
