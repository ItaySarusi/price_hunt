# PriceHunt — Final audit (T3.5)

- **Checklist:** `docs/ActualInterviewInstructions.md` Part B (B1–B31).

## How the evidence was gathered

Everything below was run or opened during this task, on this machine (macOS, .NET 10 SDK, Node 22.15.1):

1. **Full suites on a clean run.** Ports 5080 and 4200 were freed first.
   - `dotnet test server` → `Passed!  - Failed: 0, Passed: 135, Skipped: 0, Total: 135, Duration: 3 s`
   - `cd client && npm test -- --watch=false` → `Test Files 17 passed (17)` · `Tests 207 passed (207)`
   - `cd client && npx playwright test` → `11 passed (43.1s)` (desktop specs 1–6, mobile spec 7)
2. **Live run against a fresh dev DB.** `server/PriceHunt.Api/pricehunt.db*` was deleted, then the API was started with
   `dotnet run --project server/PriceHunt.Api`. I ran searches with `curl -N` (one per final status), read the DB with
   `sqlite3`, and called the History API with one, several and all suppliers and with from/to filters. Then I stopped the
   server and deleted the dev DB. Excerpts are in the [appendix](#appendix--live-evidence).
3. **Visual and behavioural QA re-run.** I started the API (fresh DB) and the client and ran
   `node ../.claude/skills/ui-visual-qa/scripts/capture-ui.mjs --out ../docs/ui-qa/T3.5 --screens search,history`, which
   ended with `[ui-qa] PASS — 0 failure(s)`. I looked at the desktop idle, running, finished and history screenshots.
   `docs/ui-qa/` is git-ignored, so the committed screenshots in `docs/screenshots/` are the ones the evidence cites.
4. **Fresh clone from GitHub HEAD.** `git clone` of the GitHub repository into a
   temp dir. `dotnet run --project server/PriceHunt.Api` was up in about 4 s; it created `pricehunt.db`, applied
   migration `20261109215028_InitialCreate`, and seeded 40 searches and 228 responses. `cd client && npm start` ran
   `prestart` (`added 476 packages`) and served `<title>PriceHunt</title>`. `git status` in the clone was still clean
   afterwards.

Paths: `Api/` = `server/PriceHunt.Api/`, `Tests/` = `server/PriceHunt.Tests/`, `app/` = `client/src/app/`,
`e2e/` = `client/e2e/`. Every test name below was confirmed with `grep`, and the suites containing them passed in step 1.

## Checklist B1–B31

| # | Item | Status | Evidence |
|---|---|---|---|
| **B1** | Server targets .NET 8+ | ✅ | `Api/PriceHunt.Api.csproj:4` `<TargetFramework>net10.0</TargetFramework>`; `server/global.json` pins SDK `10.0.100` (`rollForward: latestFeature`). |
| **B2** | Client is Angular 17+ | ✅ | `client/package.json:19` `"@angular/core": "^21.2.0"`. |
| **B3** | README names the AI tools used and where | ✅ | `README.md:258` `## 8. Where AI was used` (Claude chat for planning and spec; Claude Code with Superpowers, Ralph Loop, frontend-design and `ui-visual-qa`; model mix; the owner's review and manual requirement check; corrections made during the build). |
| **B4** | Exactly 7 suppliers behind one interface, in-process, no network | ✅ | Interface `Api/Suppliers/ISupplierClient.cs:7-12` (`GetQuoteAsync(SearchCriteria, CancellationToken)`). One `SimulatedSupplier` per config item: `Api/Suppliers/SimulatedSupplier.cs:45-48` (`SupplierRegistry`), registered as a singleton in `Api/Program.cs:33`. Seven items A–G in `Api/appsettings.json:18-24`. Simulation uses only `Task.Delay` with `TimeProvider` (`SimulatedSupplier.cs:22-36`), no HTTP. Live: `GET /api/meta/suppliers` returned exactly A…G. Test: `SimulatedSupplierTests.Builds_one_client_per_item_and_looks_up_case_insensitively`. |
| **B5** | Random 0.5–5 s delay, random price | ✅ | Config `appsettings.json:12-15` (`MinDelayMs 500`, `MaxDelayMs 5000`, price 800–4500). `Tests/Unit/SimulatedSupplierTests.cs`: `Does_not_complete_before_delay_and_completes_after` (still pending at 499 ms, done at 500 ms), `Max_random_gives_max_delay` (pending at 4999 ms, done at 5000 ms), `Price_is_within_bounds` (Theory 0.0→800, 1.0→4500, 0.5→2650), `Random_prices_stay_in_bounds_with_two_decimals`, `Price_has_at_most_two_decimals_and_rounds_away_from_zero`. Live: response times 565–4886 ms in the curl runs. |
| **B6** | One supplier fails ≈30%; one never responds | ✅ | `appsettings.json:23` `{ "Code": "F", "FailureRate": 0.3 }`, `:24` `{ "Code": "G", "NeverResponds": true }`; logic `SimulatedSupplier.cs:25-31`. Tests: `Failure_roll_below_rate_throws_only_after_delay`, `Failure_roll_at_or_above_rate_succeeds`, `NeverResponds_does_not_complete_and_ends_with_cancellation`. Live: a search with only F ended `"failed":1`. The DB row is `F  Failed  …  Supplier F is temporarily unavailable`, and G is `NoResponse` in the default search (appendix). |
| **B7** | Endpoint takes from/to location, from/to date, supplier list; omitted list = all | ✅ | DTO `Api/Search/SearchRequest.cs:4-9` (`FromLocation, ToLocation, FromDate, ToDate, string[]? Suppliers`); `Api/Search/SearchRequestValidator.cs:35-37` (null → all registered suppliers); endpoint `Api/Controllers/SearchController.cs:19` `[HttpPost("stream")]`. Unit test: `SearchRequestValidatorTests.Valid_NullSuppliers_MeansAll`. Integration test: `SearchStreamTests.Stream_WithG_TimesOut_AndFramesArriveIncrementally` sends no `suppliers` and asserts `noResponse == 1`, so G was included. Live: a request without `suppliers` returned `started` with `"total":7,"suppliers":["A",…,"G"]`. |
| **B8** | Each response streamed as soon as it arrives | ✅ | `SearchController.cs:27` `TypedResults.ServerSentEvents(…)` over the orchestrator's `IAsyncEnumerable`, which yields each outcome as it completes. Integration test `SearchStreamTests.Stream_WithG_TimesOut_AndFramesArriveIncrementally` asserts that the first `quote` frame arrives more than 300 ms before `end`. `Stream_ReturnsOrderedFrames_WithCamelCasePayloads` checks `text/event-stream`, `no-cache` and `X-Accel-Buffering: no`. Live `curl -N` with per-line timestamps (appendix A1): quotes arrived at 02:26:55, :56, :57, :57, :59, :59 and `end` at 02:27:00. |
| **B9** | README explains the streaming approach and why | ✅ | `README.md:109` `## 4. Streaming approach: how and why`: "How" (SSE over `POST`, how each price is flushed before the response ends, message sequence, 6-second limit, cancellation, stale results, isolation) and "Why SSE" (reasons + alternatives considered). |
| **B10** | 6 s max; graceful finish with results so far; client told it ended | ✅ | `appsettings.json:10` `"Search": { "TimeoutSeconds": 6 }`. `Api/Search/SearchOrchestrator.cs:57-58` creates the timeout CTS and links it with `RequestAborted`. `:143` sets `TimedOut` when suppliers are still unanswered. Unit test: `SearchOrchestratorTests.NeverRespondingSupplier_TimesOutAtExactlySixSeconds_AndIsStoredAsNoResponse` (FakeTimeProvider). E2E spec 1 "default search streams sorted results, G shows No response, ends Timed out at ~6 s" asserts 5.5–9 s. Live `end` event: `{"status":"TimedOut","total":7,"responded":6,"succeeded":6,"failed":0,"noResponse":1,"elapsedMs":6024,…}`, sent after the six quotes. |
| **B11** | A supplier failure doesn't affect others | ✅ | `SearchOrchestrator.cs:188-206` `RunOneAsync` catches per supplier (`SupplierUnavailableException`, any other `Exception`) and returns a `Failed` outcome. Unit test: `SearchOrchestratorTests.SupplierFailure_DoesNotAffectOthers`. Screenshot `docs/screenshots/search-completed-desktop.png` shows F `Failed` while A–E show prices and the search ends `Completed`. |
| **B12** | Client disconnect stops server work; cancellation reaches supplier calls | ✅ | `SearchController.cs:27` passes `HttpContext.RequestAborted`. `SearchOrchestrator.cs:58` links it, and `:193` passes the linked token to `supplier.GetQuoteAsync`, where it reaches `Task.Delay` (`SimulatedSupplier.cs:23,27`). Unit test (spy supplier): `SearchOrchestratorTests.ClientCancel_CancelsSupplierTokens_StoresCancelled_AndEmitsNoEnd`, plus `AbandonedEnumeration_MidStream_StillPersistsCancelled` and `SimulatedSupplierTests.Cancellation_during_delay_stops_promptly_without_advancing_time`. Integration test: `SearchStreamTests.ClientDisconnect_MarksSearchAndPendingSuppliersCancelled` (DB: search `Cancelled`, G `Cancelled`). Live: `curl --max-time 2` produced search `01A1C2D9-EF23` `Cancelled` with `DurationMs 2011`, and B, D, F, G stored `Cancelled` at the moment of disconnect (appendix A2). |
| **B13** | New client search stops the previous server-side search | ✅ | Client: `app/features/search/search.store.ts` uses `switchMap` to unsubscribe from the previous stream, and `app/core/search-stream.service.ts:61` calls `controller.abort()` on unsubscribe, which disconnects the HTTP request so B12 applies on the server. Unit tests: `search.store.spec.ts` "a new search resets state and aborts the previous one"; `search-stream.service.spec.ts` "aborts mid-stream on unsubscribe and stops emitting". E2E: `e2e/04-search-new-mid-flight.spec.ts:14` "new search mid-flight resets the counter, never shows stale cards and cancels the old search in the DB". Its DB assertion at `:72-80` polls `sqlite3` for `select Status from Searches where FromLocationCode='SGSIN' and ToLocationCode='NLRTM' …` → `'Cancelled'`, and the second search → `'Completed'` (`:81-83`). |
| **B14** | Form: from/to location, from/to date, supplier list all selected by default | ✅ | Screenshot `docs/screenshots/search-idle-desktop.png` (and the T3.5 re-capture `docs/ui-qa/T3.5/desktop-search-idle.png`, which I viewed): From, To, Shipping dates range, Suppliers `7 of 7` with A–G chips all on. Unit test: `search-form.spec.ts` "selects all 7 suppliers by default". |
| **B15** | Results appear progressively | ✅ | Screenshot `docs/screenshots/search-running-desktop.png` (counter, partial cards, waiting chips). E2E spec 1 (`e2e/01-search-default.spec.ts:47-52`) records every frame and asserts the counter starts at 0, never goes down and takes at least 3 different values. Unit test: `search.store.spec.ts` "applies started, quotes in sorted order, and counters". |
| **B16** | List always sorted cheapest → most expensive while results arrive | ✅ | ui-visual-qa recorded in `docs/progress.md` (T2.6: "0 jumps, 0 flickers, 0 sort violations … at all viewports across 4 capture runs"; T3.2: "all automated checks green"). T3.5 re-run, all viewports: phone `{"frames":390,"sortViolations":0,"jumps":0,"flickers":0,"countDrops":0}`, tablet `{"frames":383,…0…}`, desktop `{"frames":410,…0…}`. E2E spec 1 per-frame assertion (`e2e/01-search-default.spec.ts:36`): "frame at … ms not ascending" is checked for every recorded animation frame. Store unit tests: "orders by ascending price", "breaks price ties by earlier receivedAt, then supplier code", "a large random sequence equals a full sort". |
| **B17** | No visible flicker or jump while re-ordering | ✅ | Same ui-visual-qa runs: `jumps: 0, flickers: 0` at phone, tablet and desktop (T2.6 and T3.2 in `docs/progress.md`; T3.5 re-run above). T2.6 also recorded a reduced-motion control run that showed 3–10 jumps, which shows the check can fail. Implementation: `app/shared/flip-list.directive.ts` (FLIP slide, tracked by supplier). Unit tests in `flip-list.directive.spec.ts`: "slides an existing item from its old position…", "reuses the same DOM element for an item across re-orders", "interrupts a running slide…". |
| **B18** | "X of N suppliers responded" + clear final state | ✅ | Screenshots: `docs/screenshots/search-completed-desktop.png` ("6 of 6 suppliers responded", ✓ **Completed**) and `docs/screenshots/search-finished-desktop.png` / `docs/ui-qa/T3.5/desktop-search-finished.png` ("6 of 7 suppliers responded", ⏱ **Timed out**, G "No response"), plus `search-cancelled-desktop.png`. E2E: spec 1 `final-badge` contains "Timed out"; spec 2 "search without G ends Completed in under 6 s" checks "6 of 6 suppliers responded" and "Completed". |
| **B19** | New search cancels the previous; no old result ever appears, even late | ✅ | Store unit tests (`search.store.spec.ts`): "ignores events whose searchId does not match", "drops pipeline items carrying an old client token", "a new search resets state and aborts the previous one", "cancel() … drops late events". E2E spec 4 (title in B13) checks that every frame after the second click shows only D/E/F cards, that the counter resets to 0, and that 1.5 s later no late A/B/C card has appeared. |
| **B20** | Every search persisted with params, suppliers, timestamp, final status | ✅ | Entity `Api/Data/Entities/SearchRecord.cs:5-17` (From/To code + name, `FromDate`, `ToDate`, `SelectedSuppliers`, `CreatedAt`, `EndedAt`, `DurationMs`, `Status`). Live `sqlite3` query after real searches (appendix A2): one `TimedOut` (`A,B,C,D,E,F,G`), one `Completed` (`A,B,C,D,E,F`), one `Cancelled` (curl disconnect), one `Completed` (`F`). Tests: `SearchOrchestratorTests.PersistsSearchAndEveryOutcome_WithCorrectFields`, `DatabaseTests.SearchWithResponses_RoundTrips`. |
| **B21** | Every supplier response persisted and linked, incl. failures | ✅ | Entity `Api/Data/Entities/SupplierResponse.cs:5-15` (`SearchId` FK, `SupplierCode`, `Status`, `PriceCents`, `ResponseTimeMs`, `ReceivedAt`, `Error`). The FK cascades (`FK_SupplierResponses_Searches_SearchId … ON DELETE CASCADE` in the live schema). Live rows (appendix A2) include `Success`, `NoResponse` (G, 6024 ms), `Cancelled`, and **`Failed`**: `01A1C2DA-1282 · F · Failed · 3119 ms · Supplier F is temporarily unavailable`. Tests: `PersistsSearchAndEveryOutcome_WithCorrectFields`, `DatabaseTests.DeletingSearch_CascadesToResponses`. |
| **B22** | EF Core + SQLite; schema auto-created on first run | ✅ | `Api/Program.cs:43` `AddDbContextFactory<PriceHuntDbContext>(o => o.UseSqlite(…))`, `:54` `InitializeDatabaseAsync()`, `Api/Data/DatabaseInitializer.cs:17` `MigrateAsync`. T3.3 fresh clone (`docs/progress.md`, "T3.3 Fresh-clone check"): DB created and seeded 40/228. T3.5 fresh clone from GitHub: no DB before the run; after `dotnet run`, `pricehunt.db` existed with migration `20261109215028_InitialCreate`, 40 searches and 228 responses. No manual step. Test: `DatabaseTests.FreshDbFile_IsMigratedOnStartup`. |
| **B23** | History endpoint: start, end, supplier list (one / several / all) | ✅ | `Api/Controllers/HistoryController.cs:9-13` `GET /api/history`; query `Api/History/HistoryQuery.cs:17-30` (`Start`, `End`, `Suppliers` repeated or comma-separated). Integration test: `HistoryEndpointTests.History_SupplierFilter_OneSeveralAll` (one = `B`; several = `A&c` and `A,D`; all = omitted and explicit). Unit test: `HistoryServiceTests.SupplierFilter_OneSeveralAll`. Live (appendix A3): `suppliers=F` → only F (12 rows); `A&C` and `A,C` → A, C (25); omitted and all seven → A–G (83). |
| **B24** | History filterable by from / to location | ✅ | `HistoryQuery.cs:23-24` (`From`, `To`). Integration test: `HistoryEndpointTests.History_FromToLocationFilter`. Unit test: `HistoryServiceTests.FromAndToFilters_AreIndependent`. Live: `from=CNSHA&to=USLAX` → 7 rows, route `CNSHA->USLAX` only; `from=DEHAM` → 3 rows, `DEHAM->USNYC` only. The Cancelled rows of that search are excluded, as SPEC §10 requires. |
| **B25** | Separate history screen: start date, end date, multi-select suppliers | ✅ | Route `app/app.routes.ts:6` `/history`. Screenshot `docs/screenshots/history-desktop.png` (and `docs/ui-qa/T3.5/desktop-history-default.png`, viewed): Shipping dates range, Suppliers multi-select ("All suppliers"), From, To, Show failures, Reset/Apply. E2E: `06-history.spec.ts:89` "defaults load rows (date ascending, 25 per page)" and `:138` "filters + Apply update the URL, Back restores, failures toggle hides failed rows". |
| **B26** | Table columns Date, Route, Supplier, Price, Response Time | ✅ | `app/features/history/history-table.ts:37-91` `matColumnDef` date, route, supplier, price, responseTime (+ status). Same screenshot shows the headers DATE · ROUTE · SUPPLIER · PRICE · RESPONSE TIME · STATUS. Phone version: `docs/screenshots/history-phone.png` (row cards), E2E spec 7 "mobile: History shows row cards instead of the table". |
| **B27** | Sortable by every column | ✅ | Every header has `mat-sort-header` (`history-table.ts:38,47,54,66,80,91`), sorted server-side. E2E `06-history.spec.ts:98` "every column header sorts ascending and descending (server-side)" clicks date, route, supplier, price, responseTime and status, asserts the first row changes between asc and desc, and checks numeric order for price. Unit test: `HistoryServiceTests.Sort_EveryKey_AscAndDesc`. |
| **B28** | Pagination | ✅ | `mat-paginator` with sizes 10/25/50 (screenshot footer "1 – 25 of 158", first/prev/next/last). E2E `06-history.spec.ts:118` "next page and page size change" (Next → `page=2`, "26 – 50 of N"; size 10 → `size=10`, 10 rows). Unit tests: `HistoryServiceTests.Paging_IsStable_NoDuplicatesOrGaps_WithTies`, `Totals_AndPagePastEnd`. |
| **B29** | Git repo with two projects | ✅ | `git ls-files`: `server/` (`PriceHunt.slnx`, `PriceHunt.Api/`, `PriceHunt.Tests/`, `global.json`) and `client/` (Angular CLI workspace: `angular.json`, `package.json`, `src/`, `e2e/`). Remote `https://github.com/ItaySarusi/pricehunt.git`, cloned in this task. |
| **B30** | One command per project, no special setup | ✅ | `dotnet run --project server/PriceHunt.Api` (HTTP-only `launchSettings.json:8` `http://localhost:5080`, no dev cert) and `cd client && npm start` (`client/package.json:10` `prestart: npm install`). T3.3 fresh-clone log in `docs/progress.md` ("up in ~6 s … seeded 40 searches / 228 responses … npm start (prestart npm install) → serves <title>PriceHunt</title> … git status clean"). T3.5 re-check from GitHub HEAD: API up in ~4 s with the DB seeded; `npm start` installed 476 packages and served `<title>PriceHunt</title>`; the clone stayed clean. |
| **B31** | README covers all six required topics | ✅ | How to run `README.md:47` `## 2. Run it` · streaming how/why `:109` `## 4. Streaming approach: how and why` · database & tables `:157` `## 5. Database & tables` · design decisions & trade-offs `:220` `## 6. Design decisions & trade-offs` · what I'd do differently `:246` `## 7. What I'd do differently / with more time` · AI `:258` `## 8. Where AI was used`. |

**Result: 31 / 31 ✅, 0 ❌.** No functional gaps were found. The only change made in this task was to the README test
counts (132 / 206 → 135 / 207 after the final-review fix wave), plus the R21 row wording.

## CLAUDE.md §8 — definition of done

| Condition | Status | Evidence |
|---|---|---|
| Every task in `docs/PLAN.md` is `- [x]` | ✅ | All 22 tasks ticked. |
| `dotnet test server`, client unit tests and `npx playwright test` pass on a clean run | ✅ | 135 / 135, 207 / 207, 11 / 11 (step 1 above). |
| Fresh-clone check (PLAN T3.3) passed | ✅ | Fresh clone from GitHub HEAD (step 4). |
| README covers every section in SPEC §13 | ✅ | README headings 1–10 match SPEC §13 items 1–10 in order: overview + screenshots, Run it (`:47`), Tests (`:90`), Streaming (`:109`), Database & tables (`:157`), Design decisions (`:220`), What I'd do differently (`:246`), Where AI was used (`:258`), Requirement checklist (`:306`), Project structure (`:338`). |
| Every SPEC §1 requirement ticked in the README checklist | ✅ | `README.md` §9: R1 ✅ … R22 ✅ (22 rows, each with implementation and test references). |
| Everything committed and pushed | ✅ | Pushed to `main` on GitHub. |

## Appendix — live evidence

### A1. `curl -N` stream, default request (all suppliers), each line prefixed with seconds since the request started

```
+0s     event: started
+0s     data: {"total":7,"suppliers":["A","B","C","D","E","F","G"],"timeoutMs":6000,"searchId":"01a1c2d9-c651-…"}
+1s     event: quote
+1s     data: {"supplier":"A","supplierName":"Supplier A","price":1961.28,"currency":"USD","responseTimeMs":724,…}
+2s     event: quote
+2s     data: {"supplier":"E",…,"price":3161.75,…,"responseTimeMs":1732,…}
+3s     event: quote      (B, 3278 ms)
+3s     event: quote      (D, 3418 ms)
+5s     event: quote      (C, 4755 ms)
+5s     event: quote      (F, 4886 ms)
+6s     event: end
+6s     data: {"status":"TimedOut","total":7,"responded":6,"succeeded":6,"failed":0,"noResponse":1,"elapsedMs":6024,"searchId":"01a1c2d9-c651-…"}
```

Without G (`"suppliers":["A","B","C","D","E","F"]`): six quotes, then
`{"status":"Completed","total":6,"responded":6,…,"elapsedMs":4386,…}`.
`curl --max-time 2` with all suppliers: `started` and three quotes, then curl disconnects. No `end` event is sent.

### A2. `sqlite3 server/PriceHunt.Api/pricehunt.db` after the live searches (demo rows excluded with `IsDemo=0`)

```
id             f      t      FromDate    ToDate      SelectedSuppliers  Status     DurationMs
-------------  -----  -----  ----------  ----------  -----------------  ---------  ----------
01A1C2D9-C651  CNSHA  USLAX  2026-11-20  2026-11-30  A,B,C,D,E,F,G      TimedOut   6024
01A1C2D9-DDF7  NLRTM  SGSIN  2026-11-20  2026-11-30  A,B,C,D,E,F        Completed  4386
01A1C2D9-EF23  DEHAM  USNYC  2026-11-20  2026-11-30  A,B,C,D,E,F,G      Cancelled  2011
01A1C2DA-1282  CNSHA  NLRTM  2026-11-20  2026-11-30  F                  Completed  3127

search         search_status  sup  Status      PriceCents  ms    Error
-------------  -------------  ---  ----------  ----------  ----  -------------------------------------
01A1C2D9-C651  TimedOut       A    Success     196128      724   
01A1C2D9-C651  TimedOut       E    Success     316175      1732  
01A1C2D9-C651  TimedOut       B    Success     288498      3278  
01A1C2D9-C651  TimedOut       D    Success     424119      3418  
01A1C2D9-C651  TimedOut       C    Success     278092      4755  
01A1C2D9-C651  TimedOut       F    Success     333135      4886  
01A1C2D9-C651  TimedOut       G    NoResponse              6024  
01A1C2D9-DDF7  Completed      B    Success     266734      764   
…              (C, D, E, F, A Success)
01A1C2D9-EF23  Cancelled      C    Success     150735      565   
01A1C2D9-EF23  Cancelled      E    Success     270447      1007  
01A1C2D9-EF23  Cancelled      A    Success     415060      1634  
01A1C2D9-EF23  Cancelled      B    Cancelled               2011  
01A1C2D9-EF23  Cancelled      D    Cancelled               2011  
01A1C2D9-EF23  Cancelled      F    Cancelled               2011  
01A1C2D9-EF23  Cancelled      G    Cancelled               2011  
01A1C2DA-1282  Completed      F    Failed                  3119  Supplier F is temporarily unavailable
```

The same DB also held the demo seed: 40 searches and 228 responses.

### A3. History API (`GET /api/history?start=2026-11-20&end=2026-11-30&pageSize=50…`, summarised)

```
&suppliers=F                 totalCount 12  suppliers [F]                    statuses [Failed, Success]
&suppliers=A&suppliers=C     totalCount 25  suppliers [A, C]                 statuses [Success]
&suppliers=A,C               totalCount 25  suppliers [A, C]
(no suppliers)               totalCount 83  suppliers [A..G]                 statuses [Failed, NoResponse, Success]
&suppliers=A,B,C,D,E,F,G     totalCount 83  suppliers [A..G]
&from=CNSHA&to=USLAX         totalCount 7   routes [CNSHA->USLAX]
&from=DEHAM                  totalCount 3   routes [DEHAM->USNYC]            (Cancelled rows never listed, SPEC §10)
```
