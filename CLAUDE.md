# CLAUDE.md — Operating rules for the PriceHunt build agent

You are building **PriceHunt**, a home assignment for Ship4wd: a .NET 10 API + Angular app that streams
shipping quotes from 7 simulated suppliers and keeps a searchable price history. The UI is **dark futuristic:
glassmorphism panels + neumorphic controls, balanced glow** (SPEC §11.1) — it must look interview-ready.

You work **fully autonomously** until the project is done. The human is not available.

## 1. Sources of truth (in priority order)
0. `docs/ActualInterviewInstructions.md` — the reviewers' original brief (verbatim) + acceptance checklist.
   It decides **what** must be delivered; nothing below may drop a requirement from it.
1. `docs/SPEC.md` — every product, design and technical decision. **Final. Do not re-open decisions.**
2. `docs/PLAN.md` — the ordered task list with "Done when" checks.
3. This file — how to work.
4. Your own judgement — only for details none of the above cover (see §3).

## 2. Hard rules
- **Never ask the user a question and never wait for confirmation.** No "should I…?", no "ready to proceed?".
- **Never stop early.** If a task is done, start the next unchecked task in `docs/PLAN.md`.
- **Never mark a task done while its checks fail.** Never delete, skip or weaken a test to make it pass.
- **Never change `docs/SPEC.md` decisions.** If something in the spec is technically impossible, pick the
  closest working alternative, log it in `docs/DECISIONS.md`, and continue.
- Don't add features the spec doesn't ask for.
- No `sudo`, no `brew`, no global installs. .NET tools go in a local tool manifest (`dotnet new tool-manifest`).
- Never commit secrets, `*.db` files, `bin/`, `obj/`, `node_modules/`, `dist/`, `.angular/`, Playwright reports.
- Never force-push. Never rewrite pushed history.

## 3. When something is unclear or broken
- **Unclear detail** → choose the simplest option consistent with SPEC.md, write one entry in
  `docs/DECISIONS.md` (`date · context · decision · alternatives · why`), continue.
- **Command/build/test failure** → use the `superpowers:systematic-debugging` skill. Find the root cause.
  After 3 genuinely different approaches fail, take the documented fallback (SPEC §14), log it, continue.
- **Package version conflict** → use the latest versions that work together; log the pin in DECISIONS.md.

## 4. How to use Superpowers
- `docs/SPEC.md` and `docs/PLAN.md` replace brainstorming and plan-writing: **skip `brainstorming` and `writing-plans`.**
- Execute `docs/PLAN.md` with **`superpowers:subagent-driven-development`**: one fresh subagent per task,
  then the spec-compliance review and code-quality review. Give each subagent the task text, its
  "Done when" list and the relevant SPEC sections.
- Use **test-driven development** for: supplier simulation, search orchestrator, history query, SSE parser,
  search store (sorted insert + stale-result guard), date serialization, URL ↔ filter mapping.
- Work **directly on `main`**. No worktrees, no feature branches, no PRs. `finishing-a-development-branch` = push `main`.
- Use `superpowers:verification-before-completion` before ticking any task.

## 4b. Frontend quality gate
- After every frontend task (T2.1–T2.7, T3.2) run the project skill **`ui-visual-qa`**
  (`.claude/skills/ui-visual-qa/SKILL.md`). Follow it exactly: capture, **look at every screenshot**, score against
  the rubric, fix, repeat until PASS. Pass the skill path to frontend subagents so they run it themselves.
- If the `frontend-design` plugin is installed, use it for aesthetic choices — within SPEC §11, never against it.
- Every key element gets the `data-testid` listed in SPEC §11.1 "Test hooks".

## 5. Session start protocol (every time you start or resume)
1. `pwd` and `git status`; `git log --oneline -15`.
2. Read any open items in `docs/DECISIONS.md`.
3. Find the first unchecked task in `docs/PLAN.md`.
4. Quick health check: `dotnet build server` and (once the client exists) `cd client && npx ng build`.
   If anything is red, fix it first.
5. Continue with the next task.

## 6. After every task
1. Run the task's checks (and the full relevant test suite).
2. Tick the task in `docs/PLAN.md` (`- [x]`).
3. Append to `docs/AI-USAGE.md`: one line on what was generated and anything you corrected.
4. Commit with a conventional message (`feat(server): …`, `feat(client): …`, `test: …`, `docs: …`, `chore: …`)
   and `git push origin main`. If push fails (no remote/auth), keep committing locally.

## 7. Running things
- API: `dotnet run --project server/PriceHunt.Api` → http://localhost:5080
- Client: `cd client && npm start` → http://localhost:4200
- Start servers **in the background**, then stop them when done:
  `lsof -ti:5080 | xargs kill` and `lsof -ti:4200 | xargs kill`.
- Backend tests: `dotnet test server`
- Client unit tests: `cd client && npm test -- --watch=false` (use whatever runner the Angular CLI scaffolded)
- E2E: `cd client && npx playwright test` (Playwright starts both servers itself — see SPEC §12)
- Quick SSE smoke test:
  `curl -N -X POST http://localhost:5080/api/search/stream -H 'Content-Type: application/json' -d '{"fromLocation":"CNSHA","toLocation":"USLAX","fromDate":"<future yyyy-MM-dd>","toDate":"<later yyyy-MM-dd>"}'`

## 8. Definition of done (when to print the completion promise)
Only when **all** are true:
- Every task in `docs/PLAN.md` is `- [x]`.
- Every item B1–B31 in `docs/ActualInterviewInstructions.md` is verified, with evidence written in `docs/FINAL-AUDIT.md`.
- `dotnet test server`, client unit tests and `npx playwright test` all pass on a clean run.
- The fresh-clone check (PLAN T3.3) passed.
- README covers every section in SPEC §13.
- Every requirement in SPEC §1 is ticked in the README's requirement checklist.
- Everything is committed and pushed.

Then, and only then, output exactly: `<promise>PRICEHUNT_DONE</promise>`
Never print that phrase for any other reason, even to say you are not done.
