---
id: "@km/silvery/cursor-contrast-unguarded"
aliases:
  - km-silvery.cursor-contrast-unguarded
  - km-silvery-cursor-contrast-unguarded
created_by: claude:950534f3
created_at: 2026-04-24T08:31:55Z
closed_at: 2026-04-24T15:00:45Z
close_reason: "Fixed in silvery 51c97030: cursor.fg auto-lifts to AA via
  guard(against=cursor.bg). Espresso cursor.fg: #999 → #5D5D5D (1.96:1 →
  4.53:1). km-logview cross-domain bug fixed in e22852686."
---

# [x] Sterling cursor.fg/bg pass-through has no contrast guard — Espresso ships 1.96:1 @km/silvery #bug #P2

blocks:: [[@km/silvery]]

Sterling's cursor.fg / cursor.bg derivation in vendor/silvery/packages/ansi/src/sterling/derive.ts:500 passes through scheme.cursorText and scheme.cursorColor verbatim with NO contrast guard. Terminal cursor colors are configured for a blinky 1-cell indicator, not a large selected-row surface — they often fail WCAG AA for text.

## Evidence (Espresso theme, Ghostty)
- fg=#ffffff bg=#323232
- cursor.fg = #999999 (pass-through of scheme.cursorText)
- cursor.bg = #d6d6d6 (pass-through of scheme.cursorColor)
- cursor.fg on cursor.bg = 1.96:1 (fails AA 4.5:1 AND AA-Large 3:1)
- fg on cursor.bg = 1.45:1 (if anything forgets to set fg-cursor and falls through to $fg)
- Sterling reports violations: count=0

## Repro
Construct a ColorScheme with Espresso values, call deriveRoles, inspect result.roles.cursor. All 84 catalog themes should be checked — any with low cursor.fg/bg contrast is a shipped rendering bug.

## Proposed fix
Apply the existing guardTarget auto-lift pattern to cursor.fg/cursor.bg. The "against" argument should enforce cursor.fg ↔ cursor.bg at AA_RATIO. If auto-lift can't hit AA, record a violation so consumers can opt into strict.

## Related
- @km/silvery/invariant-matrix-gaps — the invariant matrix doesn't check cursor.fg/cursor.bg either
- Observed as user-visible bug in @km/logview: expanded+cursor ASSIST row rendered dark-on-dark