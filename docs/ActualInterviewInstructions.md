# Actual Interview Instructions — Ship4wd "PriceHunt" Home Assignment

> **For the agent:** Part A is the original assignment, transcribed word for word from the PDF the reviewers will
> grade against. **Do not edit Part A.** Part B is the acceptance checklist: before declaring the project done,
> verify every item and record the evidence in `docs/FINAL-AUDIT.md`.
>
> Precedence: on **what** must be delivered, this brief wins over everything. `docs/SPEC.md` decides **how**
> (it interprets the ambiguous points, see Part C). If you ever find SPEC.md contradicting a requirement below,
> follow this brief and log the conflict in `docs/DECISIONS.md`.

---

## Part A — Original brief (verbatim)

# SHIP4WD

# PriceHunt | Home Assignment

**Stack:** .NET 8 or later and Angular 17 or later. AI tools are allowed. Please document in the README which tools you used and where.

> **The scenario**
>
> A user searches for shipping prices between two locations for a date range. The server queries the selected suppliers (all seven by default), and prices appear on screen from cheapest to most expensive while suppliers are still responding. Every search and every price is persisted so the user can return later and filter the history by date and supplier.

## Part 1: Live Search Across Seven Suppliers

### Suppliers | simulated inside the project

- Seven suppliers behind a common interface. No real network calls are required. Simulate them.
- Each supplier responds after a random delay of 0.5 to 5 seconds, with a random price.
- One supplier fails approximately 30% of the time. One supplier never responds.

### Search parameters

- From location and to location.
- From date and to date.
- A list of suppliers to query. By default, all suppliers are selected.

### Server side

- Provide a search endpoint that accepts the search parameters, queries the selected suppliers and streams each response to the client as soon as it arrives. Do not wait for all suppliers to finish.
- The implementation approach is up to you. Explain the approach and the reasoning in the README.
- Each search has a maximum duration of 6 seconds. When the limit is reached, finish gracefully with the results collected so far and tell the client that the search has ended.
- A supplier failure must not affect the other suppliers.
- If the client cancels, either by disconnecting or starting a new search, the server must stop the work in progress. Cancellation must propagate to the supplier calls.

### Client side | Angular

- Provide a search form with from location, to location, from date, to date, and a supplier list with all suppliers selected by default. Results appear progressively.
- Keep the list sorted from cheapest to most expensive as new results arrive.
- The list should not visibly flicker or jump while it is being re-ordered.
- Show progress, for example: *"5 of 7 suppliers responded"*, with a clear final state such as *"Completed"* or *"Timed out"*.
- Starting a new search cancels the previous one. A result belonging to an old search must never appear in the new search, even if it arrives late.

## Part 2: Persistence and Price History

### Database persistence

- Persist every search: search parameters (from / to location, from / to date, selected suppliers), timestamp, and final status: completed, timed out, or cancelled.
- Persist every supplier response and associate it with its search: supplier, price, response time, and timestamp. Supplier failures must also be recorded.
- Use Entity Framework Core. Choose a database that is easy to run without installation, such as SQLite, and ensure the schema is created automatically on first run.

### Server side

- Provide a history endpoint accepting a start date, an end date, and a list of suppliers. The list may contain one, several, or all suppliers.
- The history can also be filtered by from / to location.

### Client side | Angular

- Create a separate history screen with filters for start date, end date, and multi-select supplier selection.
- Display a table with Date, Route, Supplier, Price, and Response Time. The user should be able to sort by every column and navigate between pages.

## Submission Requirements

- A Git repository, either as a link or archive, containing two projects. Running the solution should be as easy as possible: one command to run each project, with no special setup, installation, or configuration.
- README covering how to run the projects, how and why you chose to stream results to the client, database and table structure, design decisions and trade-offs, what you would do differently, and where AI was used.

**Good luck!**

---

## Part B — Acceptance checklist (agent fills in `docs/FINAL-AUDIT.md`)

For every item: run or open the thing, then write the evidence in `docs/FINAL-AUDIT.md`
(test name, command output excerpt, screenshot path, or file:line). "I believe it works" is not evidence.

### Stack & AI
- [ ] **B1** Server targets .NET 8 or later (`net10.0` in the csproj). Evidence: csproj line.
- [ ] **B2** Client is Angular 17 or later. Evidence: `@angular/core` version in `client/package.json`.
- [ ] **B3** README says which AI tools were used and where. Evidence: README section heading.

### Part 1 — Suppliers
- [ ] **B4** Exactly seven suppliers, all implementing one common interface, simulated in-process, no network calls. Evidence: interface + registration code.
- [ ] **B5** Each supplier waits a random 0.5–5 s and returns a random price. Evidence: unit test name(s).
- [ ] **B6** One supplier fails ≈30% of the time; one never responds. Evidence: config + unit tests.

### Part 1 — Search parameters
- [ ] **B7** Endpoint accepts from/to location, from/to date and a supplier list; omitting the list means all suppliers. Evidence: request DTO + integration test.

### Part 1 — Server
- [ ] **B8** Each supplier response is streamed as soon as it arrives (not after all finish). Evidence: integration test proving the first quote arrives before the response ends + a `curl -N` excerpt.
- [ ] **B9** README explains the streaming approach and why. Evidence: README section.
- [ ] **B10** 6 s maximum: at the limit the server finishes gracefully with results so far and tells the client the search ended. Evidence: unit test (TimedOut at 6 s) + `end` event excerpt.
- [ ] **B11** A supplier failure doesn't affect other suppliers. Evidence: unit test.
- [ ] **B12** Client disconnect stops server work and cancellation reaches the supplier calls. Evidence: unit test with a spy supplier + integration test showing `Cancelled` in the DB.
- [ ] **B13** Starting a new search from the client stops the previous server-side search. Evidence: E2E test + DB shows the earlier search `Cancelled`.

### Part 1 — Angular search screen
- [ ] **B14** Form has from location, to location, from date, to date and a supplier list with all selected by default. Evidence: screenshot `search-idle`.
- [ ] **B15** Results appear progressively. Evidence: `search-running` screenshot + E2E counter assertion.
- [ ] **B16** List always sorted cheapest → most expensive as results arrive. Evidence: ui-visual-qa `sortViolations: 0` + E2E.
- [ ] **B17** No visible flicker or jump while re-ordering. Evidence: ui-visual-qa `jumps: 0, flickers: 0` at all viewports.
- [ ] **B18** Progress like "5 of 7 suppliers responded" and a clear final state ("Completed" / "Timed out"). Evidence: screenshots of both final states.
- [ ] **B19** New search cancels the previous one; no result from an old search ever appears in the new one, even if late. Evidence: store unit test (stale event ignored) + E2E spec 4.

### Part 2 — Persistence
- [ ] **B20** Every search persisted with from/to location, from/to date, selected suppliers, timestamp and final status completed / timed out / cancelled. Evidence: entity + a query of the DB after a real search of each status.
- [ ] **B21** Every supplier response persisted and linked to its search: supplier, price, response time, timestamp; failures recorded. Evidence: entity + DB rows incl. a Failed row.
- [ ] **B22** EF Core + zero-install database (SQLite); schema created automatically on first run. Evidence: fresh-clone run creates the DB with no manual step (T3.3).

### Part 2 — History API
- [ ] **B23** History endpoint accepts start date, end date and a supplier list with one, several or all suppliers. Evidence: integration tests for 1, several and all.
- [ ] **B24** History can also be filtered by from / to location. Evidence: integration test.

### Part 2 — Angular history screen
- [ ] **B25** Separate history screen with filters for start date, end date and multi-select suppliers. Evidence: `history-default` screenshot.
- [ ] **B26** Table with columns Date, Route, Supplier, Price, Response Time. Evidence: screenshot.
- [ ] **B27** Sortable by **every** column. Evidence: E2E clicks each header and checks the order changes.
- [ ] **B28** User can navigate between pages. Evidence: E2E next page / page size.

### Submission
- [ ] **B29** Git repository containing two projects (server + client). Evidence: repo tree.
- [ ] **B30** One command to run each project, no special setup, installation or configuration (beyond the .NET SDK and Node). Evidence: T3.3 fresh-clone log.
- [ ] **B31** README covers: how to run · how and why results are streamed · database and table structure · design decisions and trade-offs · what you would do differently · where AI was used. Evidence: README heading for each.

**Done = every B-item ticked with evidence in `docs/FINAL-AUDIT.md`.**

---

## Part C — How SPEC.md interprets the ambiguous points
| Brief says | Interpretation in SPEC.md |
|------------|---------------------------|
| "filter the history by date" / "start date, end date" | Filters on the search's requested **shipping window** (overlap match); the Date column shows that window (SPEC §10, §11.4). |
| "final state such as Completed or Timed out" | Completed, Timed out, plus Cancelled and Connection lost on the client (SPEC §11.3). |
| "streams each response" | Server-Sent Events over HTTP, read with `fetch` (SPEC §7); README explains why (SPEC §13). |
| "no special setup, installation, or configuration" | Requires only the .NET 10 SDK and Node LTS; HTTP only (no dev certs); `npm start` installs packages itself (SPEC §4). |
| "Supplier failures must also be recorded" | Failed and NoResponse rows are stored; the History table shows them with a Status column and a toggle (SPEC §9, §11.4). |
