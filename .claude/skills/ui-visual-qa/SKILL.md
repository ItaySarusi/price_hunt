---
name: ui-visual-qa
description: Visual and behavioural QA for the PriceHunt Angular UI. Use at the end of every frontend task and before declaring the project done — captures screenshots of Search and History at phone/tablet/desktop sizes, measures re-order jumps, flicker, sort order, overflow, console errors and accessibility, then scores the screenshots against the dark glassmorphism + neumorphism design rubric and fixes what fails.
---

# UI visual QA (PriceHunt)

Goal: prove the UI **looks** like SPEC §11 (dark futuristic, glass panels, neumorphic controls, balanced glow)
and **behaves** (sorted list, no flicker/jumps, no overflow, no console errors, accessible) on every screen size.
A frontend task is not done until this gate passes (SPEC §11.6 and the task's "Done when" in PLAN.md).

## Inputs
- `<task-id>` (e.g. `T2.4`) → output folder `docs/ui-qa/<task-id>/`
- Screens touched by the task: `search`, `history` or both (T3.2 = both, all viewports)

## Procedure

1. **Start both apps in the background** (skip if already running):
   - `dotnet run --project server/PriceHunt.Api` → wait until `curl -s localhost:5080/api/meta/suppliers` answers
   - `cd client && npm start` → wait until `curl -s localhost:4200` answers
2. **Capture + measure** (run from `client/`):
   ```
   node ../.claude/skills/ui-visual-qa/scripts/capture-ui.mjs --out ../docs/ui-qa/<task-id> --screens search,history
   ```
   Options: `--viewports phone,tablet,desktop` (default all) · `--base http://localhost:4200` · `--paths /some/route`
   (extra routes to screenshot only). It writes PNGs, `report.json` and `report.md`, and exits non-zero if any
   automated check fails. If the script breaks because markup/test ids changed, **fix the script or add the missing
   `data-testid`s (SPEC §11.1 "Test hooks")** — never delete a check to make it pass.
3. **Look at every screenshot** with the Read tool. For each one, first write 2–3 lines describing what you
   actually see (background, panels, controls, text, alignment, anything odd) — then score it. No rubber-stamping:
   if you can't point at the glass, the neumorphic controls and the glow, the score is not 5.
4. **Score** each screen × viewport against `references/design-rubric.md` (10 criteria, 1–5).
5. **Write the verdict** at the end of `docs/ui-qa/<task-id>/report.md`: the score table, every issue found
   (file + what to change), and PASS/FAIL.
6. **Fix and repeat** steps 2–5 until PASS:
   - PASS = every required automated check green **and** every rubric criterion ≥ 4 on every captured screen/viewport
     (the task's "Done when" says which checks/criteria apply before the screens are complete).
   - Fix the most severe issue first (broken > unreadable > layout > polish).
   - Max 5 rounds per task. If a purely aesthetic criterion is still 3 after 5 rounds, log it in
     `docs/DECISIONS.md` (with the screenshot path) and continue. Required automated checks have no escape hatch.
7. Stop the servers you started (`lsof -ti:5080 | xargs kill`, `lsof -ti:4200 | xargs kill`).
8. In T3.2 only: copy the final desktop + phone screenshots of Search (running, finished) and History to
   `docs/screenshots/` for the README.

## What the script checks automatically
| Check | Fails when |
|-------|-----------|
| Sort order | result cards in DOM order are not ascending by `data-price` in any animation frame |
| Re-order jump | a card moves more than 75% of its height in a single frame (teleport instead of slide) |
| Flicker | a supplier's card disappears for a frame and comes back during a running search |
| Card count | the number of cards ever decreases during a running search |
| Final state | no `final-badge` within 10 s of starting a search |
| Overflow | page scrolls horizontally (`scrollWidth > innerWidth`) at any viewport |
| Console | any console error or uncaught page error |
| Accessibility | any axe `serious` or `critical` violation (WCAG 2 A/AA) |

## Tips for this design
- Glass looks "muddy" → raise blur/saturation or lower bg alpha; add the 1 px top highlight; make sure there is a
  gradient/glow *behind* the panel, otherwise glass reads as flat grey.
- Neumorphism invisible on dark → the control surface must be slightly **lighter** than the page and the light
  shadow must be very subtle (≈5% white); the dark shadow does most of the work.
- Glow everywhere = fail on "balanced intensity". Only primary button, focus ring, cheapest card, progress bar.
- Contrast failures on glass → darken the panel bg locally behind text; never dim body text below `#E6EEF8`.
- Material components rendering light surfaces → fix via `mat.*-overrides` tokens in `_material-overrides.scss`.
