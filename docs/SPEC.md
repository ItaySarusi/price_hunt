# PriceHunt — Final Specification

> Status: **FINAL**. All decisions below were made by the project owner. Implement them exactly.
> Anything not covered → §15 defaults → otherwise simplest option, logged in `docs/DECISIONS.md`.

---

## §1. Requirements from the assignment brief (must all be met)

Ship4wd "PriceHunt" home assignment. Stack: .NET 8+ and Angular 17+. AI tools allowed; README must say which and where.

**Scenario:** a user searches shipping prices between two locations for a date range. The server queries the
selected suppliers (all 7 by default); prices appear cheapest → most expensive while suppliers are still
responding. Every search and every price is persisted; the user can later filter history by date and supplier.

| ID | Requirement |
|----|-------------|
| R1 | 7 suppliers behind a common interface, simulated in-process (no real network calls). |
| R2 | Each supplier responds after a random 0.5–5 s delay with a random price. |
| R3 | One supplier fails ~30% of the time. One supplier never responds. |
| R4 | Search params: from location, to location, from date, to date, list of suppliers (default: all). |
| R5 | Search endpoint streams each supplier response to the client as soon as it arrives (don't wait for all). |
| R6 | README explains the streaming approach and the reasoning. |
| R7 | Max search duration 6 s. At the limit: finish gracefully with results so far and tell the client the search ended. |
| R8 | A supplier failure must not affect other suppliers. |
| R9 | Client cancel (disconnect or new search) stops server work; cancellation propagates to supplier calls. |
| R10 | Angular search form: from/to location, from/to date, supplier list with all selected by default. Results appear progressively. |
| R11 | List stays sorted cheapest → most expensive as results arrive. |
| R12 | List must not visibly flicker or jump while re-ordering. |
| R13 | Progress shown, e.g. "5 of 7 suppliers responded", with a clear final state ("Completed" / "Timed out"). |
| R14 | New search cancels the previous one. A result from an old search must never appear in the new one, even if late. |
| R15 | Persist every search: from/to location, from/to date, selected suppliers, timestamp, final status (completed / timed out / cancelled). |
| R16 | Persist every supplier response linked to its search: supplier, price, response time, timestamp. Failures recorded too. |
| R17 | EF Core; zero-install DB (SQLite); schema created automatically on first run. |
| R18 | History endpoint: start date, end date, list of suppliers (one/several/all); also filterable by from/to location. |
| R19 | Separate Angular history screen: filters for start date, end date, multi-select suppliers. |
| R20 | History table: Date, Route, Supplier, Price, Response Time; sortable by every column; paginated. |
| R21 | Git repo with two projects; one command to run each; no special setup/installation/configuration. |
| R22 | README: how to run, how/why streaming, DB & table structure, design decisions & trade-offs, what you'd do differently, where AI was used. |

---

## §2. Owner decisions at a glance

| Area | Decision |
|------|----------|
| Agent environment | Claude Code CLI on macOS (VS Code terminal), allowlist permissions, GitHub repo, commit + push per task on `main` |
| .NET | .NET 10 (LTS), ASP.NET Core **Controllers** |
| Solution shape | One API project organized by feature folders + one test project |
| Streaming | **Server-Sent Events**, consumed with `fetch` + stream reader (not `EventSource`) |
| Suppliers | Named **Supplier A … Supplier G**; **F fails ~30%**, **G never responds** (configurable) |
| Prices | Random uniform **$800.00–$4,500.00 USD**, 2 decimals |
| Locations | **Autocomplete from a fixed list** of 33 ports (UN/LOCODE codes) |
| History date filter | Filters on the **requested shipping window**; row matches if the window **overlaps** the filter range |
| Results UI | **Ranked cards**, "Cheapest" badge, FLIP slide animation on re-order |
| Supplier status | **Status strip** of chips (waiting / ✓ / Failed / No response / Cancelled) |
| Progress | Progress bar + "X of N suppliers responded" + 6 s countdown → final badge |
| Search extras | Cancel button · results/form kept when switching tabs · strict validation |
| Supplier picker | Toggle chips A–G + "Select all · Clear" |
| UI library | **Angular Material** (M3) for behaviour, heavily restyled |
| Visual style | **Dark futuristic: glassmorphism panels + neumorphic controls**, **balanced** intensity |
| Colors / theme | Deep navy gradient + teal/cyan glows, **dark mode only** |
| Fonts | **Space Grotesk** (headings, prices, numbers) + **Inter** (body) |
| Layout | Glass top bar with Search / History tabs, centered content (max 1100 px) |
| Visual QA | Project skill `ui-visual-qa` must pass after every frontend task (§11.6) |
| Responsive | **Fully responsive incl. phones** |
| Date format | **"Nov 9, 2026"** (`MMM d, y`) |
| History paging | Server-side, sizes 10/25/50, default 25, first/prev/next/last |
| History failures | Shown, with a Status column and a "Show failures" toggle (on by default) |
| History filters | **Apply** button, synced to URL query params; default range **today → today + 30 days**, all suppliers, sorted by date |
| Tests | Backend unit + integration; Angular unit + **Playwright E2E** |
| Seed data | ~150 demo response rows on first run when DB is empty |
| Run commands | One command per project |

---

## §3. Stack & versions

**Server**
- .NET 10 SDK, `net10.0`, ASP.NET Core Web API with **controllers** (`[ApiController]`).
- EF Core 10 + `Microsoft.EntityFrameworkCore.Sqlite`; migrations via local tool `dotnet-ef` (tool manifest).
- `Microsoft.AspNetCore.OpenApi` + `Scalar.AspNetCore` (API reference at `/scalar`, Development only).
- Tests: xUnit, `Microsoft.AspNetCore.Mvc.Testing`, `Microsoft.Extensions.TimeProvider.Testing` (`FakeTimeProvider`).
  Plain xUnit `Assert` (do **not** use FluentAssertions — v8+ is commercially licensed).
- `<Nullable>enable</Nullable>`, `<ImplicitUsings>enable</ImplicitUsings>`.
- Add a `global.json` in `server/` pinning SDK `10.0.100` with `rollForward: latestFeature` (the machine also has .NET 8).

**Client**
- Latest stable Angular CLI (≥17), created with `npx @angular/cli@latest new`. Standalone components,
  signals, built-in control flow (`@if`, `@for`), `ChangeDetectionStrategy.OnPush` everywhere, strict mode.
  Accept the CLI's defaults (zoneless or not, unit-test runner) — don't fight them.
- Angular Material + CDK (same major as Angular), M3 theming.
- RxJS only where useful (stream → Observable, `switchMap`); state in signals.
- `@playwright/test` + `@axe-core/playwright` for E2E and visual QA (Chromium + one mobile project).
- Node: current LTS (machine has 22.x).

---

## §4. Repository layout & running

```
/
├─ README.md
├─ CLAUDE.md
├─ .gitignore                 # dotnet + node + *.db + playwright artifacts + docs/ui-qa/
├─ .claude/ settings.json  skills/ui-visual-qa/
├─ docs/ SPEC.md PLAN.md DECISIONS.md AI-USAGE.md screenshots/
├─ server/
│  ├─ global.json
│  ├─ PriceHunt.slnx (or .sln — whatever `dotnet new sln` creates)
│  ├─ PriceHunt.Api/
│  │  ├─ Controllers/   SearchController.cs  HistoryController.cs  MetaController.cs
│  │  ├─ Search/        SearchOrchestrator.cs  SearchCriteria.cs  SearchEvents.cs  SearchRequestValidator.cs
│  │  ├─ Suppliers/     ISupplierClient.cs  SimulatedSupplier.cs  SupplierOptions.cs  SupplierRegistry.cs
│  │  │                 IRandomSource.cs  SupplierUnavailableException.cs
│  │  ├─ History/       HistoryQuery.cs  HistoryService.cs  HistoryRowDto.cs  PagedResult.cs
│  │  ├─ Locations/     LocationCatalog.cs
│  │  ├─ Data/          PriceHuntDbContext.cs  Entities/  Migrations/  DemoDataSeeder.cs
│  │  ├─ Program.cs  appsettings.json  appsettings.Development.json
│  │  └─ Properties/launchSettings.json
│  └─ PriceHunt.Tests/  Unit/  Integration/  TestDoubles/
└─ client/
   ├─ package.json        # "prestart": "npm install --no-audit --no-fund"
   ├─ playwright.config.ts
   ├─ e2e/
   └─ src/app/ core/ features/search/ features/history/ shared/
```

- **API:** `dotnet run --project server/PriceHunt.Api` → `http://localhost:5080`.
  HTTP only (no HTTPS profile, no `UseHttpsRedirection`) so no dev certificate setup is needed.
  `launchSettings.json` has a single `http` profile on 5080 with `launchBrowser: false`.
- **Client:** `cd client && npm start` → `http://localhost:4200`. `prestart` auto-installs packages, so this is one command.
- API base URL in `src/environments/environment.ts`: `http://localhost:5080/api`. No Angular dev-server proxy
  (proxies can buffer streamed responses). CORS on the API allows `http://localhost:4200` (any header/method).
- **Do not** enable response compression or any buffering middleware on the API.
- SQLite file: `server/PriceHunt.Api/pricehunt.db`, git-ignored. Config:
  `"ConnectionStrings": { "Default": "Data Source=pricehunt.db" }`. In `Program.cs`, if the Data Source path is
  relative, make it absolute against `builder.Environment.ContentRootPath`. Verify the file lands in
  `server/PriceHunt.Api/` when the API is started from the repo root with the run command above.

---

## §5. Suppliers

### 5.1 Configuration (`appsettings.json`)
```json
"Search": { "TimeoutSeconds": 6 },
"Suppliers": {
  "MinDelayMs": 500,
  "MaxDelayMs": 5000,
  "MinPrice": 800.00,
  "MaxPrice": 4500.00,
  "Currency": "USD",
  "Items": [
    { "Code": "A", "Name": "Supplier A" },
    { "Code": "B", "Name": "Supplier B" },
    { "Code": "C", "Name": "Supplier C" },
    { "Code": "D", "Name": "Supplier D" },
    { "Code": "E", "Name": "Supplier E" },
    { "Code": "F", "Name": "Supplier F", "FailureRate": 0.3 },
    { "Code": "G", "Name": "Supplier G", "NeverResponds": true }
  ]
},
"SeedDemoData": true
```
Bind with the options pattern. Integration tests override delays/timeouts via configuration.

### 5.2 Contract
```csharp
public interface ISupplierClient
{
    string Code { get; }
    string Name { get; }
    Task<SupplierQuote> GetQuoteAsync(SearchCriteria criteria, CancellationToken ct);
}
public sealed record SupplierQuote(string SupplierCode, decimal Price, string Currency);
```
- One `SimulatedSupplier` class, instantiated 7 times from config (registered via a `SupplierRegistry`
  that exposes `IReadOnlyList<ISupplierClient>` and lookup by code).
- Dependencies injected: `TimeProvider` (for delays) and `IRandomSource` (wraps `Random.Shared`; fakeable in tests).

### 5.3 Behaviour
1. Pick delay uniformly in `[MinDelayMs, MaxDelayMs]`; `await Task.Delay(delay, timeProvider, ct)`.
2. `NeverResponds` → instead `await Task.Delay(Timeout.InfiniteTimeSpan, timeProvider, ct)` (only ends via cancellation).
3. After the delay, if `FailureRate > 0` and `random.NextDouble() < FailureRate` → throw `SupplierUnavailableException("Supplier F is temporarily unavailable")`.
4. Otherwise return a price uniform in `[MinPrice, MaxPrice]`, rounded to 2 decimals (`MidpointRounding.AwayFromZero`).
5. Every await honours `ct` — cancellation must stop the supplier promptly (R9).

---

## §6. Locations & meta API

### 6.1 Catalog (static, in `LocationCatalog`)
Each entry: `Code` (UN/LOCODE), `Name`, `CountryCode`, `Label` = `"{Name}, {CountryCode}"`.

| Code | Name | Code | Name |
|------|------|------|------|
| CNSHA | Shanghai, CN | ITGOA | Genoa, IT |
| CNNGB | Ningbo, CN | ESVLC | Valencia, ES |
| CNSZX | Shenzhen, CN | ESBCN | Barcelona, ES |
| HKHKG | Hong Kong, HK | GRPIR | Piraeus, GR |
| SGSIN | Singapore, SG | TRIST | Istanbul, TR |
| KRPUS | Busan, KR | ILHFA | Haifa, IL |
| JPTYO | Tokyo, JP | ILASD | Ashdod, IL |
| TWKHH | Kaohsiung, TW | AEJEA | Jebel Ali, AE |
| VNSGN | Ho Chi Minh City, VN | INNSA | Nhava Sheva, IN |
| NLRTM | Rotterdam, NL | USLAX | Los Angeles, US |
| BEANR | Antwerp, BE | USLGB | Long Beach, US |
| DEHAM | Hamburg, DE | USNYC | New York, US |
| GBFXT | Felixstowe, GB | USSAV | Savannah, US |
| FRLEH | Le Havre, FR | USHOU | Houston, US |
| CAVAN | Vancouver, CA | BRSSZ | Santos, BR |
| MXZLO | Manzanillo, MX | ZADUR | Durban, ZA |
| AUMEL | Melbourne, AU | | |

### 6.2 Endpoints (`MetaController`, route `api/meta`)
- `GET /api/meta/locations` → `[{ "code": "CNSHA", "name": "Shanghai", "countryCode": "CN", "label": "Shanghai, CN" }, …]` sorted by label.
- `GET /api/meta/suppliers` → `[{ "code": "A", "name": "Supplier A" }, …]` (do not expose failure/never-responds flags).

All JSON is camelCase. Enums serialize as strings (`JsonStringEnumConverter`).

---

## §7. Search streaming API

### 7.1 Request
`POST /api/search/stream` · `Content-Type: application/json` · `Accept: text/event-stream`
```json
{
  "fromLocation": "CNSHA",
  "toLocation": "USLAX",
  "fromDate": "2026-11-20",
  "toDate": "2026-11-30",
  "suppliers": ["A","B","C","D","E","F","G"]
}
```
- `fromDate` / `toDate`: `DateOnly`, ISO `yyyy-MM-dd`.
- `suppliers`: omitted/null → all suppliers. Empty array → 400. Duplicates removed. Codes case-insensitive, normalized upper-case.

### 7.2 Validation (before streaming; failure → `400` `ValidationProblemDetails`)
- `fromLocation` and `toLocation` exist in the catalog; they differ.
- `fromDate <= toDate`.
- `fromDate >= UTC today − 1 day` (1-day tolerance so users ahead of/behind UTC aren't rejected).
- `fromDate <= UTC today + 365 days`.
- Every supplier code exists.

### 7.3 Response
`200`, `Content-Type: text/event-stream`, headers `Cache-Control: no-cache`, `X-Accel-Buffering: no`.
Each frame: `event: <type>\ndata: <json>\n\n`. Events in order:

| event | data | when |
|-------|------|------|
| `started` | `{ searchId, total, suppliers: ["A",…], timeoutMs: 6000, startedAt }` | immediately |
| `quote` | `{ searchId, supplier, supplierName, price, currency, responseTimeMs, receivedAt }` | each success, as it happens |
| `supplier-failed` | `{ searchId, supplier, supplierName, reason, responseTimeMs, receivedAt }` | each failure, as it happens |
| `end` | `{ searchId, status: "Completed" \| "TimedOut", total, responded, succeeded, failed, noResponse, elapsedMs }` | last event |

- `responded = succeeded + failed` (a failure is still a response). `noResponse = total − responded`.
- `price` is a JSON number with 2 decimals (from cents).
- On client disconnect no `end` event is sent (nobody is listening); the search is persisted as `Cancelled`.

### 7.4 Controller implementation
`SearchController.Stream` returns `IResult`:
- invalid → `TypedResults.ValidationProblem(...)`
- valid → `TypedResults.ServerSentEvents(orchestrator.RunAsync(criteria, HttpContext.RequestAborted))`
  producing `SseItem<object>` with `EventType` set per the table above, data serialized camelCase.

If `TypedResults.ServerSentEvents` can't be used from a controller in practice, write frames manually
(`Response.ContentType`, `Response.WriteAsync`, `Response.Body.FlushAsync` after each frame). Log the choice in DECISIONS.md.
Integration tests (§12) must prove frames arrive **incrementally**.

---

## §8. Search orchestration (`SearchOrchestrator`)

`IAsyncEnumerable<SearchEvent> RunAsync(SearchCriteria criteria, CancellationToken requestAborted)`

1. `searchId = Guid.CreateVersion7()`. Create its own `DbContext` via `IDbContextFactory<PriceHuntDbContext>`.
   Insert `Search { Status = Running, CreatedAt = now }` and save.
2. `timeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(TimeoutSeconds), timeProvider)`;
   `linked = CancellationTokenSource.CreateLinkedTokenSource(requestAborted, timeoutCts.Token)`.
3. Yield `started`.
4. Start **all** selected suppliers concurrently. Each runs inside `RunOneAsync(supplier, linked.Token)` which
   **never throws**: it measures elapsed time (`timeProvider.GetTimestamp()` / `GetElapsedTime`) and returns a
   `SupplierOutcome` = `Success(quote, ms)` | `Failed(reason, ms)` | `Cancelled(ms)`. Any exception other than
   cancellation → `Failed` (R8: failures are isolated).
5. Consume outcomes **in completion order** with `Task.WhenEach(tasks)`. For each:
   - `Success` → insert `SupplierResponse(Success)`, save, yield `quote`.
   - `Failed` → insert `SupplierResponse(Failed)`, save, yield `supplier-failed`.
   - `Cancelled` → no event (handled in step 6).
   When every supplier has answered before the deadline, the loop ends immediately — **don't wait out the 6 s**.
6. Final status: `requestAborted` cancelled → `Cancelled`; else any outcome `Cancelled` (deadline hit) → `TimedOut`; else `Completed`.
   For each supplier that didn't answer insert a `SupplierResponse` with status `NoResponse` (timeout) or
   `Cancelled` (client cancel), `PriceCents = null`, `ResponseTimeMs` = elapsed at cut-off.
   Update the `Search` (`Status`, `EndedAt`, `DurationMs`). Yield `end` unless cancelled by the client.
7. **Step 6 runs in a `finally` block using `CancellationToken.None`** for DB writes. When the client disconnects,
   the framework stops enumerating and disposes the iterator, so `finally` is the only place guaranteed to run.
   Before persisting, `await Task.WhenAll(tasks)` (they finish quickly once `linked` is cancelled) and cancel `linked`.
8. The `DbContext` is used only on the orchestrator's sequential path — never from inside supplier tasks.
9. Nothing outlives the request: no leaked tasks, timers or `CancellationTokenSource`s (dispose them).

**"New search cancels the previous one"** is satisfied by the client aborting its previous `fetch`, which triggers `requestAborted` (R9, R14).

---

## §9. Database (EF Core + SQLite)

### 9.1 Tables
**`Searches`**
| Column | Type | Notes |
|--------|------|-------|
| `Id` | GUID (TEXT) | PK, v7 |
| `FromLocationCode` | TEXT(5) | |
| `FromLocationName` | TEXT(64) | label, denormalized for sorting/display |
| `ToLocationCode` | TEXT(5) | |
| `ToLocationName` | TEXT(64) | |
| `FromDate` | DATE (`DateOnly`) | requested shipping window start |
| `ToDate` | DATE (`DateOnly`) | requested shipping window end |
| `SelectedSuppliers` | TEXT | `"A,B,C"` via value converter + `ValueComparer` |
| `CreatedAt` | DATETIME (UTC `DateTime`) | search timestamp |
| `EndedAt` | DATETIME? | |
| `DurationMs` | INTEGER? | |
| `Status` | TEXT | `Running` \| `Completed` \| `TimedOut` \| `Cancelled` |
| `IsDemo` | INTEGER (bool) | seeded rows |

**`SupplierResponses`**
| Column | Type | Notes |
|--------|------|-------|
| `Id` | INTEGER | PK, autoincrement |
| `SearchId` | GUID | FK → Searches, cascade delete |
| `SupplierCode` | TEXT(1) | |
| `SupplierName` | TEXT(32) | denormalized |
| `Status` | TEXT | `Success` \| `Failed` \| `NoResponse` \| `Cancelled` |
| `PriceCents` | INTEGER? | null unless Success |
| `Currency` | TEXT(3) | `USD` |
| `ResponseTimeMs` | INTEGER | |
| `ReceivedAt` | DATETIME (UTC) | |
| `Error` | TEXT(200)? | failure reason |

### 9.2 Indexes
`Searches(FromDate, ToDate)`, `Searches(FromLocationCode, ToLocationCode)`, `Searches(CreatedAt)`,
`SupplierResponses(SearchId)`, `SupplierResponses(SupplierCode)`, `SupplierResponses(Status)`, `SupplierResponses(PriceCents)`.

### 9.3 SQLite rules
- **Money as `long` cents** and timestamps as **UTC `DateTime`** — the SQLite provider can't ORDER BY / compare
  `decimal` or `DateTimeOffset`. `DateOnly` is fine.
- Enums stored as strings (`HasConversion<string>()`).
- On startup: `await db.Database.MigrateAsync()`, then `PRAGMA journal_mode=WAL;`, then seeding (§9.4).
  Migrations are committed (`server/PriceHunt.Api/Data/Migrations`). This satisfies "schema created automatically on first run".

### 9.4 Demo seed (`DemoDataSeeder`)
Runs only if `SeedDemoData` is true **and** `Searches` is empty. Deterministic (`new Random(42)`), dates relative to today:
- ~40 searches (`IsDemo = true`), random catalog routes (from ≠ to), random supplier subsets (70% all seven).
- Shipping windows: start between today −10 and today +45 days, length 1–21 days.
- `CreatedAt` spread over the last 14 days.
- Responses following the real rules (F ~30% failed, G NoResponse when selected) → ~150 response rows total.
- Search statuses: TimedOut if G was selected, else Completed; ~10% Cancelled (non-responders marked Cancelled).
Integration tests set `SeedDemoData=false`.

---

## §10. History API (`HistoryController`, route `api/history`)

`GET /api/history?start=2026-11-09&end=2026-12-09&suppliers=A&suppliers=B&from=CNSHA&to=USLAX&includeFailures=true&sortBy=date&sortDir=asc&page=1&pageSize=25`

| Param | Default | Rule |
|-------|---------|------|
| `start`, `end` | none | Shipping-window **overlap**: `Search.FromDate <= end AND Search.ToDate >= start`. Only `start` → `ToDate >= start`; only `end` → `FromDate <= end`. `start > end` → 400. |
| `suppliers` | all | Repeated param. Unknown code → 400. |
| `from`, `to` | none | Exact location code match on the search, each independent. |
| `includeFailures` | `true` | `true` → statuses Success, Failed, NoResponse. `false` → Success only. Rows with status `Cancelled` are **never** listed. |
| `sortBy` | `date` | `date` · `route` · `supplier` · `price` · `responseTime` · `status`. Anything else → 400. |
| `sortDir` | `asc` | `asc` / `desc`. |
| `page` | 1 | ≥ 1. Past the last page → empty `items`, correct `totalCount`. |
| `pageSize` | 25 | One of 10, 25, 50; else 400. |

**Sort keys** (always with a final tie-breaker `SupplierResponse.Id DESC` so pages are stable):
- `date` → `FromDate`, then `ToDate`, then `ReceivedAt DESC`
- `route` → `FromLocationName`, then `ToLocationName`
- `supplier` → `SupplierName`
- `price` → `PriceCents`, **nulls last in both directions**
- `responseTime` → `ResponseTimeMs`
- `status` → `Status`

**Response**
```json
{
  "items": [{
    "id": 123, "searchId": "…", "searchedAt": "2026-11-09T12:00:00Z",
    "fromDate": "2026-11-20", "toDate": "2026-11-30",
    "from": { "code": "CNSHA", "label": "Shanghai, CN" },
    "to":   { "code": "USLAX", "label": "Los Angeles, US" },
    "supplier": { "code": "A", "name": "Supplier A" },
    "status": "Success", "price": 1234.56, "currency": "USD",
    "responseTimeMs": 1830, "error": null
  }],
  "page": 1, "pageSize": 25, "totalCount": 137, "totalPages": 6
}
```
Filtering, sorting and paging all run **in the database** (`IQueryable`, `AsNoTracking`, `Skip/Take`, `CountAsync`).

---

## §11. Frontend

### 11.1 Design system — dark futuristic: glassmorphism + neumorphism (balanced), dark mode only

**Principles**
- **Glass** for containers: top bar, form card, progress panel, result cards, filters card, table container, overlays.
- **Neumorphism** (soft, dark) for interactive controls: buttons, supplier chips, inputs, toggles, tabs, paginator
  buttons, swap button. Raised = idle; pressed/inset = active, selected or focused.
- **Futuristic** accents: teal→cyan gradient, soft glows, thin luminous borders, faint background grid.
- **Balanced** intensity: glows only on the primary action, focus rings, the cheapest card and the progress bar.
  No neon overload, no continuously animated background.
- **Readability first**: all text meets WCAG AA (4.5:1 body, 3:1 large text) against the effective glass colour.
  Body text never sits directly on a glow; there is always a glass layer behind it.

**Background** (fixed, full-page, behind everything)
- `linear-gradient(160deg, #050B18 0%, #0A1A33 55%, #0B2340 100%)`
- plus `radial-gradient(1200px 600px at 10% -10%, rgba(20,184,166,.22), transparent 60%)`
  and `radial-gradient(900px 500px at 110% 10%, rgba(34,211,238,.16), transparent 60%)`
- two blurred glow orbs (teal top-left, cyan bottom-right, ~420 px, `filter: blur(120px)`, opacity .30), static
- faint 32 px grid lines at ~3% white opacity, masked to fade out toward the bottom

**Glass tokens**
| Token | Value |
|-------|-------|
| `--ph-glass-bg` | `rgba(255,255,255,.06)` (cards, panels) |
| `--ph-glass-bg-strong` | `rgba(255,255,255,.10)` (top bar, overlays) |
| `--ph-glass-border` | `1px solid rgba(255,255,255,.12)` |
| `--ph-glass-highlight` | `inset 0 1px 0 rgba(255,255,255,.10)` |
| `--ph-glass-blur` | `backdrop-filter: blur(18px) saturate(140%)` |
| `--ph-glass-shadow` | `0 8px 32px rgba(0,0,0,.35)` |
| radius | 16 px panels, 14 px cards |
- `@supports not (backdrop-filter: blur(1px))` and `@media (prefers-reduced-transparency: reduce)` →
  solid fallback `rgba(14,32,56,.94)`.
- Overlays (autocomplete, select, datepicker, menus, tooltips): `rgba(15,34,64,.96)` + blur; readability over effect.

**Neumorphic tokens (dark)**
| Token | Value |
|-------|-------|
| `--ph-neu-surface` | `#0F2138` (control base, slightly lighter than the page) |
| `--ph-neu-raised` | `6px 6px 14px rgba(0,0,0,.55), -6px -6px 14px rgba(255,255,255,.05)` |
| `--ph-neu-inset` | `inset 4px 4px 10px rgba(0,0,0,.55), inset -4px -4px 10px rgba(255,255,255,.05)` |
| radius | 12 px buttons/inputs, 999 px chips/toggles/tabs |
- **Inputs** are wells (inset). Focus → `0 0 0 2px rgba(45,212,191,.55), 0 0 18px rgba(45,212,191,.25)`.
- **Primary button** ("Search prices", "Apply"): accent-gradient fill `linear-gradient(135deg,#14B8A6,#22D3EE)`,
  text `#04121F` (dark text for contrast), outer glow `0 0 24px rgba(34,211,238,.35)`; hover brighter; pressed → inset.
- **Secondary buttons** (Cancel, Reset, Select all, Clear, swap, paginator): raised neumorphic surface, light text; pressed → inset.
- **Supplier chips**: unselected = raised, muted text; selected = inset + 1 px teal border + teal text + small glowing dot in the supplier colour.
- **Slide toggle**: inset track, raised thumb, "on" = teal glow.
- Disabled controls: 45% opacity, no shadow, no glow.

**Colour tokens**
| Token | Value | Use |
|-------|-------|-----|
| `--ph-text` | `#E6EEF8` | primary text |
| `--ph-text-muted` | `#94A3B8` | secondary text, labels |
| `--ph-text-faint` | `#64748B` | non-essential hints only |
| `--ph-teal` | `#2DD4BF` | accents, focus, sort arrows, links |
| `--ph-cyan` | `#22D3EE` | gradient end, glows |
| `--ph-accent-gradient` | `linear-gradient(135deg,#14B8A6,#22D3EE)` | primary buttons, progress fill, logo mark |
| `--ph-success` / bg | `#34D399` / `rgba(52,211,153,.14)` | Cheapest, Completed, ✓, OK |
| `--ph-danger` / bg | `#F87171` / `rgba(248,113,113,.14)` | Failed, Connection lost |
| `--ph-warning` / bg | `#FBBF24` / `rgba(251,191,36,.14)` | Timed out, No response |
| `--ph-neutral` / bg | `#94A3B8` / `rgba(148,163,184,.14)` | Cancelled |
- Status tags/badges: pill, tinted bg, 1 px border in the status colour at 40% alpha, text in the status colour.
- Supplier avatar colours (letter `#04121F` on the circle): A `#2DD4BF`, B `#60A5FA`, C `#A78BFA`, D `#F472B6`,
  E `#FB923C`, F `#A3E635`, G `#94A3B8`.

**Typography**
- **Space Grotesk** 500/600/700: page titles (28 px desktop / 24 px phone), section titles, tab labels, prices,
  counters, rank numbers. Headings letter-spacing −0.01em.
- **Inter** 400/500/600: body, labels, form fields, table cells.
- Google Fonts `<link>` in `index.html` with `display=swap`; fallbacks `system-ui, -apple-system, sans-serif`.
- Changing numbers (prices, counter, countdown, response times) use `font-variant-numeric: tabular-nums`.
  Check visually that Space Grotesk's figures don't shift width while the counter/countdown updates; if they do,
  render those changing numbers in Inter instead (log it in DECISIONS.md).

**Angular Material integration**
- M3 **dark** theme: `mat.theme((color: (theme-type: dark, primary: mat.$cyan-palette, tertiary: mat.$azure-palette),
  typography: (plain-family: Inter, brand-family: 'Space Grotesk'), density: 0))`.
- Restyle with the official override mixins (`mat.form-field-overrides`, `mat.button-overrides`, `mat.chips-overrides`,
  `mat.slide-toggle-overrides`, `mat.table-overrides`, `mat.paginator-overrides`, `mat.tabs-overrides`, …) and
  `--mat-sys-*` system variables, kept in `src/styles/_material-overrides.scss`. Shadows/glass that tokens can't
  express go in scoped global classes (`.ph-glass`, `.ph-neu-raised`, `.ph-neu-inset`, `.ph-glow`). No `::ng-deep`.
- Material surfaces that would paint opaque backgrounds over glass (table, paginator, form-field containers,
  cards) get transparent backgrounds via tokens.

**Motion** (transform/opacity only — nothing that triggers layout)
- Hover/press/focus transitions 150–250 ms ease-out. FLIP re-order 220 ms (§11.3).
- "Cheapest" badge plays a single 600 ms glow pulse when rank #1 changes (not looping).
- Progress bar shows a subtle moving sheen while a search runs.
- `prefers-reduced-motion: reduce` disables all of the above (instant updates).

**Performance**
- At most ~12 elements with `backdrop-filter` on screen at once. Never blur per table row — blur the table container only.
- Background orbs and grid are static; scrolling must stay smooth on a mid-range laptop.

**Formatting**: dates `MMM d, y` → "Nov 9, 2026"; ranges "Nov 20 – Nov 30, 2026" (same year collapsed),
"Dec 28, 2026 – Jan 3, 2027" across years; prices `$1,234.56` (`en-US`, USD); response times "1.83 s".
Material date adapter: native adapter, `MAT_DATE_LOCALE = 'en-US'`, display format `MMM d, y`.

**Test hooks**: put `data-testid` on key elements so tests and the visual-QA skill can find them:
`from-input`, `to-input`, `swap-btn`, `date-start`, `date-end`, `supplier-chip-{A..G}`, `select-all`, `clear-all`,
`search-btn`, `cancel-btn`, `progress-text`, `countdown`, `final-badge`, `status-chip-{A..G}`, `result-card`
(+ `data-supplier`, `data-price` attributes), `history-filters`, `apply-btn`, `reset-btn`, `failures-toggle`,
`history-table`, `history-row`, `history-card` (phone), `paginator`.

### 11.2 App shell
- **Glass top bar**, sticky, 64 px (56 px on phones), `--ph-glass-bg-strong` + blur + bottom glass border.
- Left: logo mark (36 px rounded square, accent-gradient fill, `directions_boat` Material Symbol in `#04121F`)
  + wordmark "Price**Hunt**" in Space Grotesk 600, "Hunt" filled with the accent gradient (`background-clip: text`).
- Right: **Search** / **History** pill tabs (router links, `mat-tab-nav-bar` or custom): active = neumorphic inset +
  teal text + 2 px gradient underline glow; inactive = muted text, hover lightens.
- Routes: `''` → redirect `search`; `search`; `history`; `**` → `search`. Lazy-load both feature routes.
- Content container: max-width 1100 px, centered, padding 24 px (16 px on phones), over the §11.1 background.
- Page titles (Space Grotesk): "Find the best shipping price" (Search), "Price history" (History),
  each with a one-line muted subtitle ("Live quotes from up to 7 suppliers" / "Every quote we've collected").

### 11.3 Search screen

**Form card** (glass; desktop: one row From · ⇄ · To · Dates · Search button, supplier chips row below; phones: stacked full width)
- **From / To**: `mat-autocomplete` over `/api/meta/locations` (loaded once, cached). Filter by label or code,
  case-insensitive contains. The value must be a catalog entry (custom validator); show the label.
- **Swap button** (icon `swap_horiz`) between From and To.
- **Dates**: one `mat-date-range-input` (Start / End) with `mat-date-range-picker`; `min` = today.
- **Suppliers**: `mat-chip-listbox` with `multiple`, 7 chips "Supplier A … G" each with its avatar colour dot,
  **all selected by default**; text buttons "Select all · Clear" beside the label.
- **Buttons**: primary accent-gradient **"Search prices"** (icon `search`). Stays enabled during a search; clicking it again
  starts a new search and cancels the old one. Secondary neumorphic **"Cancel"** button visible only while a search is running.
- **Strict validation** (Search disabled while invalid; messages after touch or submit):
  - "Choose a location from the list" · "From and To must be different"
  - "Dates can't be in the past" · "End date must be on or after start date"
  - "Select at least one supplier"
- **Date serialization**: build `yyyy-MM-dd` from the local date parts (`getFullYear/getMonth/getDate`).
  **Never** use `toISOString()` — it shifts dates by a day in UTC+ time zones.
- Server 400 → error banner above results with the problem-details messages.

**Progress panel** (glass; appears when a search starts)
- Text: **"{responded} of {total} suppliers responded"** (`aria-live="polite"`).
- Right side while running: countdown "4.2 s left" (from `started.timeoutMs`, updated every 100 ms; cosmetic only).
- Progress bar (`mat-progress-bar` restyled, or custom) determinate = responded / total: inset neumorphic track,
  accent-gradient fill with a soft glow and a moving sheen while running.
- When finished, the countdown becomes a badge driven by the **server's `end` event**:
  ✓ **Completed** (success colours) · ⏱ **Timed out** (warning) · **Cancelled** (neutral, set by client on Cancel/new search)
  · **Connection lost** (danger, if the stream errors before `end`).
- Summary under the bar after the end: "4 prices · 1 failed · 2 no response".

**Supplier status strip**: one chip per selected supplier in A→G order.
States: waiting (14 px spinner), ✓ with response time (success), ✕ "Failed" (danger, tooltip = reason),
⏱ "No response" (warning, set at `end` with TimedOut), "Cancelled" (neutral). Tooltip shows response time.

**Ranked result cards** (successful quotes only)
- Card (fixed height 72 px desktop / 64 px phone, 8 px gap): rank "#1", avatar circle with letter, supplier name,
  response time (muted, "1.83 s"), price right-aligned large (Space Grotesk 22 px, `--ph-text`, tabular).
  Each card is glass (§11.1). Rank #1 has a green **"Cheapest"** badge and a luminous accent border
  (1 px gradient border + `0 0 24px rgba(45,212,191,.25)` glow) that moves with whichever card is #1.
- Ordering: ascending price; ties → earlier `receivedAt` first. New quotes are **binary-inserted** (no full re-sort,
  no list re-creation). `@for (q of quotes(); track q.supplier)` so DOM nodes are reused.
- **No flicker / no jump (R12)**: FLIP animation in a small `flipList` directive — before each update record each
  card's `getBoundingClientRect().top` by supplier key; after render, set `transform: translateY(old − new)` then
  transition to 0 over 220 ms `cubic-bezier(.2,.8,.2,1)`. New cards fade/scale in (0.96 → 1, 160 ms).
  Disable animations when `prefers-reduced-motion: reduce`.
- States: before the first search → empty state "Pick a route and dates to compare up to 7 suppliers.";
  running with no quotes → 3 shimmer skeleton cards; finished with no quotes → "No supplier returned a price this time. Try again."

**State & cancellation (R14)**
- `SearchStore` (`providedIn: 'root'`, signals) holds form value, status, events, quotes, supplier states.
  Because it's root-level, **switching to History and back keeps the form, results and even a running search**.
- `SearchStreamService.stream(request): Observable<SearchEvent>` uses `fetch` with an `AbortController`;
  unsubscribing aborts the request. The store feeds searches through `switchMap`, so a new search aborts the old one.
- **Stale-result guard**: each search gets a client token (incrementing number). The store remembers the current
  token and the `searchId` from `started`; every event is applied only if both match. Late events are dropped.
- Cancel button → abort, status `Cancelled`, waiting chips → Cancelled.

**SSE client parser** (hand-written, unit-tested, no library): read `response.body` with a `TextDecoder` stream;
buffer text; split frames on blank lines (`\n\n`, tolerate `\r\n`); parse `event:` and `data:` lines (join
multi-line data with `\n`); `JSON.parse`. Non-2xx → parse problem details and emit an error. Ignore comment lines (`:`).

### 11.4 History screen

**Filters card** (glass; desktop: one/two rows; phones: stacked)
- Shipping dates (`mat-date-range-input`), default **today → today + 30 days**.
- Suppliers (`mat-select multiple`; trigger shows "All suppliers" when all selected, otherwise "Supplier A, C (+2)"), default all.
- From (optional autocomplete) · To (optional autocomplete) — same catalog control as Search, with a clear (×) button.
- "Show failures" `mat-slide-toggle`, default on.
- Buttons: primary accent-gradient **Apply**, secondary neumorphic **Reset** (back to defaults).
- Helper text under dates: "Shows searches whose shipping window overlaps these dates."

**URL sync**: filters, sort and paging live in query params
`?start=2026-11-09&end=2026-12-09&suppliers=A,B&from=CNSHA&to=USLAX&failures=1&sort=date&dir=asc&page=1&size=25`
(omit params equal to defaults). Opening the URL restores the state; Back/Forward work. Apply → page resets to 1.

**Table** (`mat-table` + `matSort` + `mat-paginator`, **server-side** sort & paging)
| Column | Content | Sortable |
|--------|---------|----------|
| Date | shipping window "Nov 20 – Nov 30, 2026"; tooltip "Searched Nov 9, 2026, 14:03" | ✓ (`date`) |
| Route | "Shanghai, CN → Los Angeles, US" | ✓ (`route`) |
| Supplier | avatar dot + "Supplier A" | ✓ (`supplier`) |
| Price | "$1,234.56" right-aligned; "—" when no price | ✓ (`price`) |
| Response time | "1.83 s"; "> 6 s" for NoResponse | ✓ (`responseTime`) |
| Status | tag: OK (success) · Failed (danger, tooltip = error) · No response (warning) | ✓ (`status`) |

- **Look**: the table sits in one glass container (blur on the container only). Transparent header row in
  Space Grotesk 12–13 px, uppercase, letter-spacing .06em, muted; active sort column label + arrow in teal.
  Rows separated by `rgba(255,255,255,.06)` dividers, hover `rgba(255,255,255,.04)`. Paginator buttons neumorphic.
  Phone row cards (§11.5) are glass cards.
- Default sort: Date ascending. `mat-paginator` with `[10, 25, 50]`, default 25, `showFirstLastButtons`, "1 – 25 of 137".
- Loading: thin indeterminate progress bar above the table; keep the previous rows visible (no blank flash).
- Empty: "No prices match these filters." + Reset button. Error: banner "Couldn't load history." + Retry.

### 11.5 Responsive & accessibility
- Breakpoints: phone < 600 px, tablet 600–1023 px, desktop ≥ 1024 px (CDK `BreakpointObserver` or CSS).
- **Phones**: forms stacked full width; status chips wrap; result cards keep fixed height with smaller type;
  the History table is replaced by **row cards** (Route as title; Date, Supplier, Price, Response time, Status as
  label/value pairs) plus a "Sort by" `mat-select` + direction toggle; paginator stays at the bottom.
- Tablet: History table scrolls horizontally if needed.
- Every control has a label; visible focus ring (teal); WCAG AA contrast; progress text is `aria-live`.

### 11.6 Visual QA gate (project skill `ui-visual-qa`)
- The repo ships `.claude/skills/ui-visual-qa/` (SKILL.md, capture script, design rubric). It captures screenshots
  of every screen/state at phone (390×844), tablet (820×1180) and desktop (1440×900), measures re-order jumps,
  sort order, horizontal overflow, console errors and axe accessibility violations, then the agent **looks at every
  screenshot** and scores it against the rubric in `.claude/skills/ui-visual-qa/references/design-rubric.md`.
- Run it at the end of **every frontend task** (T2.1–T2.7) for the screens that task touched, and for everything in T3.2.
- A frontend task is not done until its gate passes (see each task's "Done when" in PLAN.md).
  Reports go to `docs/ui-qa/<task-id>/report.md` (screenshots alongside; `docs/ui-qa/` is git-ignored).
  The final T3.2 set is copied to `docs/screenshots/` for the README.
- If the official `frontend-design` plugin is installed, use its guidance for aesthetic decisions within this spec.

---

## §12. Testing

**Backend — unit** (`PriceHunt.Tests/Unit`, `FakeTimeProvider` + fake `IRandomSource`)
- Supplier: delay within bounds; price within bounds and 2 decimals; F fails at the configured rate
  (fake random) and only after its delay; G never completes until cancelled; cancellation stops promptly.
- Orchestrator: events in completion order; ends immediately when all answered (`Completed`, no 6 s wait);
  G selected → `TimedOut` at exactly 6 s with G stored as `NoResponse`; F failure doesn't affect others;
  client cancel → supplier tokens cancelled (spy supplier), search stored `Cancelled`, no `end` event;
  every outcome persisted with correct status, cents and response time.
- History: overlap rules (both / start-only / end-only), supplier filter, from/to filter, `includeFailures`,
  `Cancelled` rows excluded, every sort key asc/desc, price nulls last, stable paging, totals, validation errors.

**Backend — integration** (`WebApplicationFactory<Program>`, temp SQLite file per test class, `SeedDemoData=false`,
fast config: delays 20–200 ms, timeout 1 s)
- `POST /api/search/stream` → `text/event-stream`; first event `started`, last `end`; read the body
  incrementally and assert the first `quote` arrives **before** the response completes.
- Validation → 400 problem details.
- Client disconnect mid-stream (cancel the read) → within 2 s the DB shows the search as `Cancelled`.
- `GET /api/history` returns rows persisted by a real search; `GET /api/meta/*` work.
- Fresh DB file is migrated automatically on startup.

**Client — unit** (CLI's default runner)
- SSE parser: frames split across chunks, CRLF, multi-line data, comments.
- Sorted insert: order, ties, no duplicate supplier.
- Stale guard: events with an old token/searchId are ignored.
- Local date → `yyyy-MM-dd` without UTC shift.
- History filter ⇄ URL param mapping (defaults omitted, round-trip).
- Formatters (price, date range, response time).

**E2E — Playwright** (`client/e2e`, Chromium desktop 1280×800 + iPhone 13 project)
- `playwright.config.ts` `webServer` starts both apps: API with env `ConnectionStrings__Default=Data Source=pricehunt.e2e.db`
  (deleted before the run) and the client via `npm start`; `reuseExistingServer: !process.env.CI`.
- Specs:
  1. Default search (all suppliers): progress counter increases; cards always sorted ascending (read prices from DOM
     several times while running); G shows "No response"; final badge **Timed out** around 6 s.
  2. Search without G → final badge **Completed** in < 6 s.
  3. Cancel mid-search → **Cancelled**; no new cards appear afterwards.
  4. New search mid-flight → counter resets; never more cards than selected suppliers; no stale cards.
  5. Validation messages and disabled Search button.
  6. History: defaults load; sort by Price toggles order; next page / page size change; filters + Apply update the URL; Back restores; failures toggle.
  7. Mobile project: search form usable; History shows row cards.

---

## §13. README (required sections, in this order)
1. **PriceHunt** — one-paragraph overview + screenshots.
2. **Run it** — prerequisites (.NET 10 SDK, Node LTS); the two commands; URLs; DB file location; how to reset the DB; `/scalar` API reference.
3. **Tests** — `dotnet test server`, client unit tests, `npx playwright test`.
4. **Streaming approach — how and why**: SSE over HTTP; why not SignalR/WebSockets (one-way data, no hub,
   plain HTTP cancellation), long polling or `EventSource` (GET-only, auto-reconnects and would re-run the search);
   sequence of a search (started → quote/failed in completion order → end); 6 s timeout; how cancellation flows
   (abort → `RequestAborted` → linked token → supplier `Task.Delay`); stale-result guard.
5. **Database & tables** — both tables with columns, indexes, statuses; why cents and UTC `DateTime` on SQLite; migrations on startup; demo seed.
6. **Design decisions & trade-offs** — feature folders vs layers, controllers, denormalized names, CSV supplier list,
   per-event saves, history date semantics (shipping-window overlap), FLIP animation, client-side countdown vs server truth,
   glass/neumorphic styling on top of Angular Material.
7. **What I'd do differently / with more time** — e.g. real supplier adapters with Polly retries/circuit breakers,
   per-supplier timeouts, a Postgres/SQL Server move, auth/multi-user, rate limiting, caching, observability (OpenTelemetry), Docker.
8. **Where AI was used** — planning and spec written with Claude (chat); implementation by Claude Code using the
   Superpowers, Ralph Loop and frontend-design plugins plus the `ui-visual-qa` skill; summary of `docs/AI-USAGE.md`;
   what was reviewed or changed by hand.
9. **Requirement checklist** — R1–R22 from SPEC §1, each with where it's implemented and which test covers it.
10. **Project structure** — short tree.

---

## §14. Fallbacks (use only after real debugging, then log in DECISIONS.md)
| Problem | Fallback |
|---------|----------|
| `TypedResults.ServerSentEvents` unusable from a controller | Write SSE frames manually with explicit flushes |
| `dotnet-ef` migrations tooling fails | `EnsureCreatedAsync()` on startup; README notes migrations as future work |
| A Material override mixin/token doesn't exist in the installed version | Scoped global CSS class on the component host; no `::ng-deep` |
| Glass blur causes jank (dropped frames while cards animate) | Remove `backdrop-filter` from result cards only; keep tinted glass bg + border |
| FLIP directive is unreliable | Angular CDK/`@angular/animations` list animation with stable `track`; still no re-creation |
| Playwright can't launch the API via `webServer` | Start both servers in the background manually, run tests, then stop them |
| `git push` fails | Keep committing locally; final summary says the push is pending |

## §15. Defaults for anything not covered
- Language: English, LTR. Currency USD only.
- Logging: built-in `ILogger`; log search start/end with id, status, counts. No extra logging libraries.
- Errors: global exception handler → problem details (500) with no stack trace outside Development.
- No authentication, no Docker, no CI pipeline (optional GitHub Actions workflow only if every task is done).
- Code style: C# file-scoped namespaces, `sealed` where sensible, records for DTOs; Angular: one component per
  file set, `inject()` over constructor DI, signals for component state, typed reactive forms.
- Keep dependencies minimal: nothing beyond what this spec names without a DECISIONS.md entry.
