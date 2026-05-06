---
mentions:
  - silvery
  - km
  - claude
id: "@km/silvery/split"
aliases:
  - km-silvery.split
  - km-silvery-split
created_by: claude:55df8ef1
created_at: 2026-03-09T18:28:19Z
closed_at: 2026-03-09T19:08:53Z
close_reason: Split complete. 236 files organized across 8 packages
  (@silvery/react, term, ansi, theme, tea, ui, test, compat). All cross-package
  imports rewritten. TypeScript compiles with 0 errors. Pushed to GitHub.
owner: bjorn@stabell.org
assignee: claude:55df8ef1
---

# [x] Split hightea monolith into @silvery/* packages @km/silvery #task #P2 @claude:55df8ef1

Move code from vendor/hightea monolith into silvery monorepo packages.

Replaces @km/_orphan/w297c (the original package split bead — now tracked here).

## Package boundaries

@silvery/react — reconciler, components (Box, Text, base), hooks, pipeline, focus, input, layout
@silvery/term — runtime (run, createApp), buffer, ANSI output, terminal protocols, input parsing
@silvery/ansi — already separate (vendor/hightea/packages/ansi) → move to packages/ansi
@silvery/theme — from vendor/swatch + ThemeContext + resolveThemeColor. Plugin-based (withTheme)
@silvery/tea — store/, core/, tea/ directories. Pure TS, no React dep
@silvery/ui — all higher-level components (TextInput, TextArea, Modal, Picker, Table, etc.)
@silvery/test — testing/ directory (createRenderer, locators, compare-buffers)

## Approach

1. Create silvery monorepo (@km/silvery/monorepo done first)
2. Move files from vendor/hightea/src/ into packages/*/src/
3. Fix all internal imports
4. Verify all tests pass
5. Publish 0.1.0

## Depends on

- @km/silvery/monorepo (need repo structure first)

