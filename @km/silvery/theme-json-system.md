---
id: "@km/silvery/theme-json-system"
aliases:
  - km-silvery.theme-json-system
  - km-silvery-theme-json-system
created_by: claude:cd034ca4
created_at: 2026-04-26T15:37:37Z
closed_at: 2026-04-26T15:49:43Z
close_reason: Redundant — @silvery/theme already ships 50 built-in schemes
  (catppuccin/dracula/solarized/gruvbox/tokyo-night + 45 more), runtime
  validator (validate.ts), CLI (bun theme list/show/json/inspect), builder,
  generators, importer, exporter. Audit found bead description was written
  without checking current implementation. If a published .json schema for
  external *.theme.json editing is wanted later, it's a 30-line follow-up not
  worth a P1 bead.
---

# [x] silvery theme JSON Schema + 5-10 starter themes @km/silvery #feature #P1

blocks:: [[@km/silvery]]

Published theme JSON Schema + loader, extends existing <ThemeProvider>. Starter pack: Catppuccin, Tokyo Night, Gruvbox, Dracula, Solarized + a few more. Community PRs bring 30+ later.

Estimated ~200-400 LOC + theme files. Independent — runs parallel with diff-code-accordion.

Source plan: hub/silvery/future/ai-terminal/component-parity-plan.md § Tier 0 bead 2.