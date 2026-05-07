---
mentions:
  - km
  - claude
id: "@km/themex/cli"
aliases:
  - km-themex.cli
  - km-themex-cli
created_by: claude:66437c43
created_at: 2026-03-03T12:47:38Z
closed_at: 2026-03-03T13:31:49Z
owner: bjorn@stabell.org
assignee: claude:66437c43
---

# [x] themex CLI: browse, generate, detect, import/export @km/themex #feature #P3 @claude:66437c43

themex CLI: browse, generate, detect, import/export.

## Status

Basic CLI implemented (Phase 4 partial):

- list: shows all 43 built-in themes with color swatches
- show <name>: full theme details (surface ramp, accents, semantic tokens, palette)
- generate <primary>: ANSI 16 theme generation
- import <file>: Base16 YAML import
- export <name>: Base16 YAML export
- validate <name>: palette validation

Available via 'bun cli' in vendor/beorn-themex.

## Remaining

- Interactive TUI browse mode (inkx-powered, with live preview)
- Interactive TUI generate mode (color wheel, real-time preview)
- Terminal palette detection (themex detect)

