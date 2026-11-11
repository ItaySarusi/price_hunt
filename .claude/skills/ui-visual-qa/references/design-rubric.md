# PriceHunt design rubric (score each 1–5; PASS needs ≥ 4 on every item)

5 = matches SPEC §11 exactly and looks polished · 4 = matches, minor nits · 3 = recognisable but clearly off ·
2 = mostly wrong · 1 = missing/broken.

| # | Criterion | What a 5 looks like |
|---|-----------|---------------------|
| 1 | **Dark futuristic theme** | Deep navy gradient background with soft teal/cyan glow orbs and a faint grid; no default light Material surfaces anywhere (inputs, menus, datepicker, table, paginator). |
| 2 | **Glassmorphism** | Top bar, form card, progress panel, result cards, filters card and table container are translucent with visible blur, 1 px light border and top highlight; background colour subtly shows through; not flat grey, not muddy. |
| 3 | **Neumorphism** | Buttons/chips/toggles/tabs/paginator buttons are softly raised; inputs are inset wells; selected chips and pressed buttons are inset; the effect is visible but subtle on the dark surface. |
| 4 | **Readability & contrast** | All text crisp and legible (body `#E6EEF8`, muted `#94A3B8` only for secondary text); nothing sits directly on a glow; numbers are tabular; axe reports no serious contrast issues. |
| 5 | **Hierarchy & layout** | Clear page title + subtitle; Search reads form → progress → status strip → results; consistent 4/8 px spacing and radii (16/14/12/999); nothing cramped, clipped or overlapping. |
| 6 | **Results list** | Cards equal height, rank numbers, avatar, price prominent in Space Grotesk; #1 has the Cheapest badge + luminous border; list sorted; re-order slides smoothly (script reports 0 jumps/flicker). |
| 7 | **States** | Idle empty state, running (skeletons, countdown, sheen), finished (badge + summary), Timed out/Cancelled badges, History loading/empty/error — all designed, none look like raw defaults. |
| 8 | **Responsive** | Phone: stacked form, wrapped chips, tap targets ≥ 40 px, History as glass row cards, no horizontal scroll. Tablet/desktop: balanced use of width, nothing stretched or tiny. |
| 9 | **Polish & consistency** | Space Grotesk headings/prices and Inter body actually load; Material Symbols consistent; visible teal focus rings; hover/pressed states; no default blue links, stray scrollbars or misaligned icons. |
| 10 | **Balanced intensity** | Glow only on primary buttons, focus rings, cheapest card and progress bar; the UI feels futuristic but calm and professional — something you'd show in a job interview. |

## Report table template
| Screen · viewport | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | Notes |
|-------------------|---|---|---|---|---|---|---|---|---|----|-------|
| search-idle · desktop | | | | | | n/a | | | | | |
| search-running · desktop | | | | | | | | | | | |
| search-finished · desktop | | | | | | | | | | | |
| history-default · desktop | | | | | | n/a | | | | | |
| … repeat for tablet and phone | | | | | | | | | | | |
