---
id: "@km/silvery/plateau-delete-legacy-shims"
aliases:
  - km-silvery.plateau-delete-legacy-shims
  - km-silvery-plateau-delete-legacy-shims
created_by: claude:c6244087
created_at: 2026-04-23T09:48:46Z
closed_at: 2026-04-23T10:22:47Z
close_reason: "Shipped in silvery 4b8dfa67 + km 91615556d. detectColor and
  detectTerminalCaps deleted from @silvery/ansi. 11 call sites migrated:
  chalk.ts, style.ts, term.ts (createNodeTerm), termtest.ts, output.ts (notify),
  non-tty.ts (isTTY), scroll-region.ts (supportsScrollRegions),
  kitty-graphics.ts + sixel-encoder.ts (image probes), km-tui tui.tsx
  (term.caps), km-tui command-bridge.ts (createTerminalProfile). Exports cleaned
  up in ansi index, detection, ag-term index+ansi+terminal-caps+input, ag-react
  exports. Tests migrated to createTerminalProfile equivalent. Term construction
  preserves the explicit-caps-wins-over-env contract via env: {} neutralization
  when caps provided."
---

# [x] Delete detectColor and detectTerminalCaps shims — use TerminalProfile everywhere @km/silvery #task #P3 @claude:c6244087

blocks:: [[@km/silvery]]

After terminal-profile-plateau Phase 3 introduced createTerminalProfile as the single source of truth, the legacy shims `detectColor` and `detectTerminalCaps` still exist in @silvery/ansi/detection.ts and are re-exported through @silvery/ag-term. Two km apps (tui.tsx:76, board/command-bridge.ts:34) and several internal silvery modules still call them.

## Why delete

The shims exist as parallel APIs and tempt new code to bypass the profile. Every shim call is a place where:
- FORCE_COLOR / NO_COLOR env reads happen outside profile.ts
- Phase 3's documented precedence chain is re-derived (or skipped)
- The shim's docstring and the profile's docstring can drift

## Migration

### @km/tui
- apps/@km/tui/src/tui.tsx:76 — `caps = detectTerminalCaps()` → read `term.caps` (Term is already in scope above)
- apps/@km/tui/src/board/command-bridge.ts:34 — `detectTerminalCaps().kittyKeyboard` → accept caps via DI or call createTerminalProfile once

### silvery internal
- vendor/silvery/packages/ink/src/chalk.ts:45,103 — replace with createTerminalProfile().colorTier
- vendor/silvery/packages/ag-term/src/termtest.ts:15 — same
- vendor/silvery/packages/ag-term/src/input.ts:84 — re-export, keep as alias
- vendor/silvery/packages/ag-term/src/ansi/term.ts:693,703 — already in the Term constructor path; keep as internal helper or inline

## Phased plan
1. Mark shims @deprecated with redirect comment.
2. Migrate @km/tui + silvery internal call sites to createTerminalProfile / term.caps.
3. Keep the public re-export for one release as a compat shim.
4. Delete in silvery 1.1.

## Effort
~2 hours. Call sites are thin and mechanical.

ASK (breaking change): user approval needed before step 3 or 4.

From /big review 2026-04-23 (H6 action item).