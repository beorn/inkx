# SILVERY RESOLVER — route to the canonical source BEFORE any UI work

> **Stop.** About to edit anything under `apps/km-tui/src/views/`? Touching anything in `vendor/silvery/`? Making a claim about what silvery can/can't do? Walk this resolver first. **This doc contains NO content of its own — it routes you to silvery's own primers.** If the linked doc has been read in this session, skip; otherwise read the relevant section before answering the question.

## Canonical silvery primers (read these, don't skim)

| Primer | Live at | When to read |
|---|---|---|
| **The Silvery Way** | `vendor/silvery/docs/guide/the-silvery-way.md` | First UI task of the session. Always. |
| **Styling Guide** | `vendor/silvery/docs/guide/styling.md` | Any color/typography/theme work |
| **Silvery CLAUDE.md** | `vendor/silvery/CLAUDE.md` | Pre-flight for any silvery edit |
| **silvery-components audit gate** | `.claude/skills/tui/silvery-components.md` | Before building any list/modal/input/etc |

If you can't answer the resolver's questions without reading, read.

## Decision Tree

### Q1. Building a list, picker, modal, input, scroll, button, spinner, progress, tabs?
→ `.claude/skills/tui/silvery-components.md` — audit gate. If silvery has it, use it.

### Q2. Applying colors, typography, bold/dim, or any styling?
→ `vendor/silvery/docs/guide/styling.md`
→ For the `$muted` vs `$muted + dim` MECE rule: styling.md §2 "Build Hierarchy" callout.
  TL;DR — `$muted` alone for meta/caption/hint; `<Small>` preset (bundles `$muted + dim`) for fine print; **never manually pair the two**.

### Q3. Fighting a typography preset (Small / Muted / H1-3 / P / Strong / Em)? Want to override its default dim / bold / color?
→ `vendor/silvery/docs/guide/typography-overrides.md` (covers the `{...rest}` spread pattern — e.g. `<Small dimColor={false}>`)
→ Source: `vendor/silvery/packages/ag-react/src/ui/components/typography.tsx`

### Q4. Do you expect color / theme to cascade from a parent Box?
→ `vendor/silvery/docs/guide/styling.md` (cascade section)
→ `vendor/silvery/packages/ag-react/src/ui/components/typography.tsx` (top JSDoc)

### Q5. Writing a key handler, focus scope, or input capture?
→ `vendor/silvery/CLAUDE.md` Input Handling section
→ `docs/lessons/input-architecture.md` (km-specific routing)

### Q6. Touching the rendering pipeline (dirty flags, incremental, scroll tiers, sticky)?
→ **STOP. Spawn `Agent(subagent_type: "silvery")`.** Pipeline edits require expert.
→ `vendor/silvery/packages/ag-term/src/pipeline/CLAUDE.md`

### Q7. Need to verify output at the ANSI / terminal level?
→ `.claude/skills/tests/termless.md`

### Q8. Something's missing in silvery — wrap in km or add upstream?
→ Default: add upstream. `vendor/silvery/` is a submodule.
→ `vendor/silvery/docs/guide/the-silvery-way.md` principle #1

### Q9. About to claim "silvery doesn't support X"?
→ **STOP.** Grep before asserting:
```
grep -rn "<feature>" vendor/silvery/packages/ag-react/src/ vendor/silvery/packages/ag-term/src/
```
→ See memory: `feedback-check-before-claiming-limits.md`

### Q10. First UI edit of the session?
→ Re-read `vendor/silvery/docs/guide/the-silvery-way.md` front to back. Non-negotiable.

## Session-start protocol

1. Any km-tui edit planned? Walk the resolver. Identify which Qs apply.
2. Read the linked primer sections (not this file — the actual silvery docs).
3. Only then code.

## Anti-patterns this resolver prevents

- Reasoning about silvery from Ink/blessed intuition ("ANSI is flat", "presets are closed")
- Dropping to raw `<Text>` instead of overriding a preset via prop-spread
- Duplicating silvery knowledge in km — always point upstream

The 2026-04-17 `<Small dimColor={false}>` bug was caused by ignoring this resolver's Q3 + Q9. Walk it next time.
