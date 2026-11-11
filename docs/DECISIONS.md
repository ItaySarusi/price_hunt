# Decision log

Decisions made during the build because SPEC.md didn't cover them, or because a spec'd approach didn't work.

Format:
```
## <short title>
- Context: what was unclear or broken
- Decision: what was chosen
- Alternatives: what else was considered
- Why: one or two lines
- Spec ref: §x.y (if a fallback from §14 was used, say so)
```

---

## T0.2 package pins and tool manifest location
- Context: scaffolding the server; the .NET 10 SDK creates the tool manifest as `dotnet-tools.json` at the repo root (not `.config/`).
- Decision: manifest at repo root `dotnet-tools.json` (dotnet-ef 10.0.14); EF Core Sqlite/Design, OpenApi, Mvc.Testing 10.0.14; Scalar.AspNetCore 2.19.0; Microsoft.Extensions.TimeProvider.Testing 10.11.0; xunit 2.9.3 (template default).
- Alternatives: `.config/dotnet-tools.json`; xunit v3.
- Why: SDK default is discovered automatically by `dotnet tool restore` from the root; latest stable versions that restore and build together.
- Spec ref: §3

---

## T0.3 Angular 21 pinned for Node 22.15 compatibility
- Context: Angular 22 CLI requires Node >=22.22.3; the target machine has Node 22.15.1 and R21 requires `npm start` to work with zero setup. Angular CLI 21 supports Node ^20.19 || ^22.12 || >=24.
- Decision: Angular 21.2.x (core/cli/build 21.2, Material/CDK 21.2.14), scaffolded with `npx @angular/cli@21`. Test runner is the CLI default (Vitest + jsdom, no browser); command `npm test -- --watch=false`. `vitest` pinned to exact 4.0.18 because npm 10.9.2 crashes ("Cannot read properties of null (reading 'edgesOut')") resolving the peer set of the scaffold's default vitest ^4.0.8 (which resolves to 4.1.x). Playwright via @playwright/test + @axe-core/playwright.
- Alternatives: Angular 22 with a newer Node (needs setup); upgrading npm (global install, forbidden).
- Why: works on the stock machine toolchain with no setup.
- Spec ref: §3

## T1.4 orchestrator details not fixed by §8
- Context: §8 leaves a few edge cases open: outcomes that settle after the consumer stopped enumerating, the cut-off time, test seams for suppliers.
- Decision: (1) On abandoned enumeration (client disconnect) every supplier not yet streamed is stored `Cancelled`, even if its task happened to settle while draining — the user never saw it. (2) `ResponseTimeMs`/`ReceivedAt` for non-answerers, `DurationMs`/`EndedAt` and `end.elapsedMs` all use the cut-off measured at the start of finalization (6000 ms on a deadline). (3) Empty `criteria.Suppliers` means all suppliers (controller rejects empty arrays anyway); unknown codes throw `ArgumentException`. (4) `SupplierRegistry.FromClients(...)` static factory for tests (a public ctor taking `IEnumerable<ISupplierClient>` would confuse DI constructor selection). (5) Orchestrator registered as singleton (all dependencies are singletons; per-search state lives in the iterator). (6) `RunAsync` token is `[EnumeratorCancellation]` so `WithCancellation(...)` also cancels suppliers.
- Alternatives: persist late successes as Success; measure cut-off per supplier.
- Why: simplest consistent reading of §7.3/§8.6 ("no new cards after cancel"; history mirrors what the user saw).
- Spec ref: §8

## T1.5 SSE serialization and 400 body
- Context: §7.4 suggests `SseItem<object>` and `TypedResults.ValidationProblem`. Observed: `TypedResults.ValidationProblem` returned from a controller action dropped the `errors` member (body had only type/title/status/traceId); `[JsonIgnore]` on the abstract `EventType` is not inherited by overrides, so `eventType` leaked into payloads.
- Decision: `TypedResults.ServerSentEvents` is used from the controller (no §14 fallback needed) with `SseItem<string>` whose data is `JsonSerializer.Serialize(e, e.GetType(), <global HTTP JsonOptions>)` (raw JSON on the data line, runtime type, camelCase). Validation failure returns `TypedResults.Json(new HttpValidationProblemDetails(errors), 400, "application/problem+json")`. `[JsonIgnore]` added to each `EventType` override.
- Alternatives: `SseItem<object>` with default formatter (serializes via declared type, risky); `IActionResult` + `ModelState`.
- Why: deterministic payloads and a 400 body that includes field errors, verified by integration tests.
- Spec ref: §7.3, §7.4

---

## T1.7 demo seed row count exceeds "~150"
- Context: SPEC §9.4 asks for ~40 searches and ~150 response rows, but 40 searches with 70% all-seven already imply >= 196 rows.
- Decision: keep the explicit generation rules (40 searches, `new Random(42)`, 70% all seven, others a random 1-6 subset) and accept the resulting row count (~200-230).
- Alternatives: fewer searches; a lower all-seven share; truncating rows (would break one-row-per-selected-supplier).
- Why: the explicit rules are the testable ones; "~150" is approximate and inconsistent with them.
- Spec ref: §9.4

---

## T2.1 theme implementation details
- Context: SPEC §11.1 lists Material override mixins and global classes but leaves the concrete control markup open.
- Decision: (1) Buttons are native `<button class="ph-btn [ph-btn--primary|--icon|--text]">` styled by `_neu.scss`, not `matButton` — the neumorphic shadows/gradient fill would need global overrides of Material internals anyway. (2) All `mat-form-field`s default to `appearance: 'fill'` + `subscriptSizing: 'dynamic'` (MAT_FORM_FIELD_DEFAULT_OPTIONS) and become inset wells via form-field tokens plus one global rule on `.mat-mdc-text-field-wrapper` (shadow can't be a token). (3) Supplier chips are `mat-chip-option.ph-chip`; Material's selection checkmark is hidden and replaced by the glowing supplier dot (selection still exposed via `aria-selected`). (4) Background gradients live on `<html>` (whole document) and the fixed `.ph-bg` layer holds only the static orbs + grid, so long pages/full-page screenshots have no hard edge. (5) `mat.theme-overrides` sets teal primary/navy surfaces on `:root` so it wins over the `html { mat.theme() }` block. (6) Icons: Material Symbols Outlined via `MAT_ICON_DEFAULT_OPTIONS.fontSet`. (7) Component selector prefix `ph`.
- Alternatives: matButton + button-overrides; outline form fields; custom chip component.
- Why: smallest amount of Material-internal CSS while matching §11.1; no `::ng-deep`.
- Spec ref: §11.1, §14 (scoped global class fallback for shadows)

## T2.3 search store failure and bookkeeping semantics
- Context: SPEC §11.3 does not say what the store does on HTTP 400, on a lost connection, when the request omits suppliers, or how counters are derived.
- Decision: (1) HTTP 400 (`ApiProblemError`) -> status back to `idle`, `problem` {title, messages} set for the banner, supplier chips/total/selection cleared. (2) Connection lost (stream closes without `end`, or network error) -> status `ConnectionLost`, still-waiting chips become `cancelled`. (3) When the request has no `suppliers`, the selected list is taken from `started.suppliers` (no MetaService dependency in the store). (4) `responded/succeeded/failed/noResponse` are computed live from the supplier-state map; `startedAt` is the client clock when `started` arrives (countdown only). Quotes for already-succeeded or unselected suppliers are ignored.
- Alternatives: dedicated `error` status for 400; fetching all suppliers from MetaService at search time; storing counters from the `end` event.
- Why: simplest option consistent with the spec; the banner is shown from `problem` regardless of status, and live counters need no extra state.
- Spec ref: §11.3

## T2.4 search form details
- Context: SPEC §11.3 lists five exact validation messages but none for missing dates; the store's persisted `suppliers: string[]` couldn't distinguish "never set" from "user cleared all"; placement of Cancel isn't specified.
- Decision: (1) Missing/unparseable dates show "Choose a start and end date" (the only extra message; empty From/To use "Choose a location from the list"). (2) `SearchFormValue.suppliers` is `string[] | null`, null = default all. (3) From/To typed text that exactly matches a label or code is resolved to that entry on blur; no `requireSelection` (so the catalog message can show). (4) Error messages are computed by the parent (touched or submit attempted) and fed to fields through `ErrorStateMatcher`s; "From and To must be different" shows under To. (5) Layout: desktop one row + chips row with Cancel under Search; tablet From ⇄ To / Dates + Search(+Cancel) / chips; phone stacked with Search + Cancel side by side while running. (6) Date field has no prefix icon (the picker toggle already shows a calendar) and hides the required asterisk.
- Alternatives: no message for missing dates; separate `formTouched` flag in the store; Cancel replacing Search.
- Why: simplest options consistent with §11.3; no layout shift when Cancel appears on desktop.
- Spec ref: §11.3, §11.5

## T2.5 progress summary wording, countdown rounding, digit font
- Context: SPEC §11.3 gives the summary example "4 prices · 1 failed · 2 no response" and the countdown "4.2 s left" but not zero/plural/cancel cases or rounding; §11.1 asks to verify Space Grotesk digit widths.
- Decision: summary always shows the three parts (zeros kept, "1 price"/"N prices"), and appends " · N cancelled" only when some suppliers were cancelled (Cancel / Connection lost) so the numbers add up to the total. Countdown rounds UP to the next tenth and clamps at 0.0 (never shows 0.0 while time remains, never exceeds the timeout). Space Grotesk with tabular-nums measured: all digits 0–9 have identical advance width (36.31 px per 4 glyphs at 20 px), so counter/countdown stay in Space Grotesk (no Inter switch). The summary line is always rendered (empty while running) and on phones the countdown/badge sits on its own fixed row, so nothing below the panel shifts when a search ends.
- Alternatives: omit zero parts; show cancelled as "no response"; switch digits to Inter.
- Why: matches the spec example literally, stays honest for cancelled searches, avoids layout shift.
- Spec ref: §11.1, §11.3

## T2.6 background orb/grid layer spans the document instead of the viewport
- Context: with 7 result cards the Search page is taller than the viewport; the `position: fixed` `.ph-bg` layer (orbs + grid, T2.1 decision 4) is only viewport-tall, so full-page screenshots (visual QA, README) showed a hard edge where the cyan orb was cut off.
- Decision: `.ph-bg` is `position: absolute; inset: 0` inside the app shell host (`position: relative`), so the orbs and grid cover the whole document. Gradients stay on `<html>`.
- Alternatives: keep it fixed and accept the screenshot artefact; capture viewport-only screenshots.
- Why: no edge in any capture; the background is still static (§11.1), it just scrolls with the page.
- Spec ref: §11.1

## T2.7 History screen details not fixed by the spec
- Context: §11.4/§11.5 leave a few behaviours open.
- Decision:
  - **Invalid URL params** (bad dates, unknown sort/dir, size not in 10/25/50, page < 1, unknown supplier codes, malformed location codes) fall back to their defaults individually; `start > end` resets both dates. An empty/unknown supplier list means "all".
  - **Sort/page reset**: a header click (or the phone Sort-by/direction control) resets to page 1, the same as Apply. A new sort column starts ascending; `matSortDisableClear` so it only toggles asc/desc.
  - **Apply with unchanged filters** re-queries without pushing a duplicate history entry; Apply is disabled while the form is invalid (dates missing/invalid, no supplier, typed From/To not picked from the catalog).
  - **Page past the end** (e.g. an old link after the data shrank) → `replaceUrl` to the last page instead of showing an empty table.
  - **Phone row cards** are tinted glass without their own `backdrop-filter`; the surrounding results container is the single blurred layer (§11.1 "never blur per row", ≤ ~12 blurred elements). A Failed card shows the error text next to the tag, because phones have no hover tooltip.
  - **Error state** hides the results container and shows only the banner + Retry; **loading** dims the previous rows to 75% under a 3 px gradient bar.
  - **Tablet table**: routes wrap only between origin and destination, and the "Response time" header may wrap to two lines, so the table fits 820 px without scrolling (horizontal scroll still kicks in below ~680 px). Desktop uses fixed column widths so the columns don't jump when the sort changes.
- Alternatives: reject invalid URLs with an error; keep the page when sorting; blur each card.
- Why: simplest behaviour that keeps shared links working and matches the spec's performance rule.
- Spec ref: §11.4, §11.5, §11.1

## E2E (T3.1) setup details
- Context: SPEC §12 names the projects and specs but not the browser engine, worker count, how the e2e DB is reset, or how B13 ("DB shows the earlier search Cancelled") is observed — `GET /api/history` never returns Cancelled searches.
- Decision:
  - **iPhone 13 project runs on Chromium** (`...devices['iPhone 13'], browserName: 'chromium'`): only Chromium is installed (no global installs allowed); viewport, DPR, touch and UA still match the device.
  - **One worker, no retries**: all search specs share one API and assert real timings (6 s timeout, < 6 s completion).
  - **Fresh e2e DB**: the API `webServer` command is `rm -f pricehunt.e2e.db* && dotnet run` with cwd `server/PriceHunt.Api` (the content root that `Data Source=pricehunt.e2e.db` resolves against). Real supplier config and demo seed stay on.
  - **B13 evidence**: spec 4 reads the e2e DB with the `sqlite3` CLI (read-only) and polls until the first search is `Cancelled` (and the second `Completed`).
  - **Ordering/staleness checks** use an in-page `requestAnimationFrame` recorder (every frame's progress text, badge and cards) instead of only sampling from the runner; timings (Timed out ~6 s, Completed < 6 s) are measured in-page from the Search click to the first frame with the badge.
  - **Console guard**: an auto fixture fails any test that logs a `console.error` or an uncaught page error.
  - **Page-size change** keeps Material's default behaviour (the first visible row stays on screen, e.g. page 2 @25 → page 3 @10); the spec asserts that.
- Alternatives: install WebKit for a true iPhone run; expose a debug API for search status; poll the DOM from the runner only.
- Why: simplest setup that keeps assertions strict and deterministic without adding product surface.
- Spec ref: §12, §14; ActualInterviewInstructions B13, B16, B19, B27, B28

## T3.2 polish: motion, phone card layout, top-bar tint, client README
- Context: deferred review items for T3.2 (SPEC §11.1 motion = transform/opacity only; phone result-card price size; top-bar glass legibility on phones; generic client README).
- Decision:
  - **Motion**: hover/press/focus effects no longer transition `box-shadow`/`background-color`/`color`/`filter`. Buttons and nav tabs fade an overlay pseudo-element's `opacity` for the hover "lighten"; press uses `transform: translateY(1px)`; shadows, focus rings, chip/paginator states and table-row hover switch instantly.
  - **Phone result cards** keep the SPEC 22 px price. To avoid truncating the supplier name, the "Cheapest" badge moves on phones (< 600 px) from beside the name to the second line, next to the response time. The result-list grid gets `grid-template-columns: minmax(0, 1fr)` so content can't widen the cards past the container.
  - **Top bar**: `--ph-glass-bg-strong` layered over a `rgba(7,18,36,.86)` navy tint with `blur(28px) saturate(140%)`, so content scrolling under it stays dim even without blur. A sharpness probe showed that headless Chromium (used for QA screenshots) does not reliably render backdrop blur for fixed/sticky layers at deviceScaleFactor 2. At DPR 1 the bar measured fully blurred (edge contrast 1 vs 29 without blur). Real browsers blur normally. The phone screenshots are framed so no high-contrast control sits under the bar.
  - **client/README.md** (Angular CLI boilerplate) deleted; the root README (T3.4) is the only README.
- Alternatives: 20 px phone price (rejected: SPEC says 22 px and moving the badge is cleaner); a near-opaque top bar (rejected: loses the glass look).
- Why: matches SPEC values exactly and keeps phone cards readable.
- Spec ref: §11.1, §11.2, §11.3, §11.5

## Final review clean-ups
- Context: final review findings (unknown history location codes, stale Running searches, leaked supplier error text, unused branches, page overflow).
- Decision: (1) History page: a 400 from `/api/history` while `from`/`to` are set drops both location filters and reloads with `replaceUrl` (no catalog timing dependency). (2) `DatabaseInitializer` marks leftover `Running` searches `Cancelled` (EndedAt = now if null) after migration; their responses are not touched. (3) Orchestrator exposes/persists only `SupplierUnavailableException` messages; any other supplier exception becomes "Supplier error" and is logged at Warning. (4) History `page` must be 1..100000 (int overflow in skip). (5) Removed the "empty supplier list means all" branch in `SearchOrchestrator.ResolveSuppliers` (controller rejects empty arrays; no test used it; supersedes part 3 of the T1.5 entry).
- Alternatives: waiting for the location catalog before querying; marking stale responses Cancelled.
- Why: simplest robust options.
