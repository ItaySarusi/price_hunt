# AI usage log

Feeds the README's "Where AI was used" section.

## Planning (before any code)
- Requirements breakdown, every product/design/technical decision, `docs/SPEC.md`, `docs/PLAN.md` and `CLAUDE.md`
  were produced in a planning conversation with Claude (claude.ai). The owner answered every design question; Claude wrote the spec.

## Implementation
- Built by Claude Code (Opus 5.5) running autonomously with the **Superpowers** plugin (subagent-driven development,
  TDD, code review) inside a **Ralph Loop** (keeps the session going until the definition of done is met).
- Models: the Opus 5.5 controller handed each task to a fresh Claude Code subagent: Opus for design-heavy and
  concurrency-critical work (orchestrator, store review, theme/form/progress/cards/History, E2E, final QA, README),
  Sonnet for most other implementers and reviewers, Haiku for one small, scoped re-review.
- UI quality: official **frontend-design** plugin + the project skill **`ui-visual-qa`** (Playwright screenshots at
  3 viewports, flicker/jump/sort/overflow/console/axe checks, rubric scoring by Claude looking at the screenshots).

## Per-task log
Format: `T<id> — what Claude generated · what was corrected or rewritten and why`

- T0.1 — Claude verified toolchain and extended .gitignore · nothing corrected
- T0.2 — Claude Code subagent scaffolded server projects and Program.cs; reviewer subagent approved; no corrections
- T0.3 — Claude Code subagent scaffolded the client; controller rejected its first attempt (Angular 22 on a temporary Node 24) and had it re-scaffolded on Angular 21 for zero-setup on system Node
- T1.1 — Claude Code subagent wrote catalog, meta API and tests (TDD); reviewer verified all 33 entries; no corrections
- T1.2 — Claude Code subagent wrote suppliers TDD-first with FakeTimeProvider; review clean; no corrections
- T1.3 — Claude Code subagent built the EF Core data layer; reviewer flagged an entity/namespace name clash, fixed by rename
- T1.4 — Claude Code (Opus) subagent built the orchestrator test-first; Opus reviewer verified iterator-disposal semantics with a scratch program; no corrections
- T1.5 — Claude Code subagent built the SSE endpoint + validator; it fixed two framework gotchas itself (ValidationProblem dropping errors, JsonIgnore not inherited); review clean
- T1.6 — Claude Code subagent built the history API test-first; review clean
- T1.7 — Claude Code subagent wrote the seeder test-first; controller ruled on the spec's row-count inconsistency; review clean
- T2.1 — Claude Code (Opus) subagent built the theme/shell and ran 3 visual-QA rounds; controller and reviewer inspected screenshots; no corrections
- T2.2 — Claude Code subagent wrote the SSE parser and services test-first; review clean
- T2.3 — Claude Code subagent built the store; Opus reviewer found no race but asked for decision logging and a mutation-verified token-guard test, both added
- T2.4 — Claude Code (Opus) subagent built the form; controller's own screenshot review caught a capture-timing artefact the subagent's QA missed (fixed in the QA script + tests)
- T2.5 — Claude Code (Opus) subagent built the progress panel and status strip test-first, 3 visual-QA rounds; controller checked screenshots; review clean
- T2.6 — Claude Code (Opus) subagent built cards + FLIP test-first; Opus reviewer verified hook ordering/zoneless snapshot timing; no corrections
- T2.7 — Claude Code (Opus) subagent built the History screen test-first; controller checked default/phone/empty/error screenshots; review clean
- T3.1 — Claude Code (Opus) subagent wrote the E2E suite; reviewer ran a focused browser check to rule out a click-blocking UI bug; controller re-ran the suite
- T3.2 — Claude Code (Opus) subagent ran the final QA/polish; controller's screenshot check caught ghosted text in a README phone shot (re-framed)
- T3.3 — Controller ran the fresh-clone check directly (pure verification)
- T3.4 — Claude Code (Opus) subagent wrote the README; an Opus fact-checker verified every cited path/test/number against the code and requested 7 wording fixes
- T3.5 — Claude Code (Opus) subagent compiled the evidence-backed final audit; controller re-ran all suites and spot-checked the audit before tagging
