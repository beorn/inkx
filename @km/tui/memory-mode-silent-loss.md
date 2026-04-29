---
id: "@km/tui/memory-mode-silent-loss"
aliases:
  - km-tui.memory-mode-silent-loss
  - km-tui-memory-mode-silent-loss
created_by: Bjørn Stabell
created_at: 2026-04-06T20:42:27Z
closed_at: 2026-04-21T05:41:27Z
close_reason: >-
  Fixed via (1) startup prompt + (3) prominent banner, the recommended
  "preferred" combination.


  Implementation (5 commits on main):

  - 3886d296e: failing tests for both surfaces (banner + prompt)

  - f37cc3df8: feat(km-tui): MemoryModeBanner — prominent top-of-workspace
    1-row warning rendered when repo.mode === "memory". Uses $bg-warning bg
    + $fg-on-accent text + bold so it's unmissable across themes. Wired into
    BoardApp with showMemoryModeBanner prop (default true in production,
    false in the driver/test-app so fixed-row-coordinate tests don't shift).
  - c82eec585: feat(km-cli): promptMemoryModeInit({stdin, stdout}) — CLI
    helper with injectable streams. Three outcomes: "init" (default/Enter/
    y), "memory" (m), "cancel" (n). Unrecognized input re-prompts with a
    3-attempt cap that falls back to cancel.
  - 90d46d2bc: feat(km-cli): wire prompt into `km view` — runs BEFORE
    patchConsole/alt-screen so the warning is visible on normal terminal.
    Only fires when interactive + TTY + no .km/ + no ancestor .km/. On
    "init" calls new initKmDirectory(targetDir, { withGtd }) extracted from
    `km init`. On "cancel" exits 130.
  - ff2650f11: style(oxfmt) — formatter-only wrap-width normalization.


  Tests (11, all green):

  - apps/km-tui/tests/memory-mode-banner.slow.test.tsx (5) — banner visible
    + copy + position above board + survives nav/edit transitions + opt-out
    default.
  - apps/km-cli/tests/memory-mode-prompt.slow.test.ts (6) — default Enter,
    y, m, n, path shown, unrecognized re-prompts.

  Verified:

  - `npx tsc --noEmit` in apps: 0 km errors.

  - `bun vitest run --project=slow memory-mode-*.slow.test.tsx
    memory-mode-prompt.slow.test.ts`: 11/11 pass.
  - `bun vitest run apps/km-tui/tests/showcase.spec.ts` (canary): 15/15
    pass.
  - Real-PTY capture of `bun km view /tmp/km-prompt-test` (no .km/) shows
    the yellow prompt on the normal terminal before alt-screen:
      ⚠  This directory has no .km/ — km would run in memory mode.
         Path: /tmp/km-prompt-test
         ...
      Initialize? [Y/m/n]:
  - `bun km view /tmp/km-memory-mode-test` with stdin piped shows the
    banner in the alt-screen output (rgb 235,203,139 bg + bold dark text):
      ⚠️ Memory mode — edits will NOT be saved. Run `km init` to persist
      changes.

  The fast-suite regressions that were present before this work (3 tests

  in nav-garble-wide + column-rendering) are unrelated and were not

  introduced by these commits — the driver defaults showMemoryModeBanner

  to false so existing fixed-row-coordinate tests are unaffected.
---

# [x] [bug] Memory mode silently discards edits — user thinks changes saved @km/tui #bug #P2

Repro: bun km view /path/without/.km/, edit task, exit. Edits appear saved (visual update) but nothing persists.

Tiny 'MEM' indicator is not prominent. User assumes changes saved.

Recommendation: prompt on startup when opening non-init'd vault, or persist via direct write-through, or make MEM indicator very prominent.