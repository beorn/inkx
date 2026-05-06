---
mentions:
  - km
id: "@km/silvery/ansi-rename"
aliases:
  - km-silvery.ansi-rename
  - km-silvery-ansi-rename
created_by: claude:55df8ef1
created_at: 2026-03-10T06:43:05Z
closed_at: 2026-03-10T06:47:46Z
close_reason: Not needed — Term/createTerm is already the terminal abstraction
  (not just ANSI styling). It has stdin/stdout, dims, caps, I/O, and is already
  passed to render(). The plan is to extend createTerm() with Provider
  capabilities, not rename it.
owner: bjorn@stabell.org
---

# [x] Rename Term/createTerm/useTerm to Style/createStyle/useStyle @km/silvery #task #P2

## What

Rename the ANSI styling helper from `Term` to `Style`:

| Old          | New           |
| ------------ | ------------- |
| Term (type)  | Style         |
| createTerm() | createStyle() |
| useTerm()    | useStyle()    |
| TermContext  | StyleContext  |

## Why

Frees up `createTerm()` / `useTerm()` for the runtime terminal abstraction (`km-silvery.terminal-abstraction`). The styling helper is just a chalk proxy + capability detection — `Style` describes it accurately.

Endgame naming:

- `createStyle()` → chalk styling proxy
- `createTerm()` → runtime terminal (Provider + writable)

## Scope

~121 occurrences across ~73 files (source, examples, docs, tests). Mechanical rename — no logic changes.

## Sequencing

Do before `km-silvery.terminal-abstraction` so that `createTerm()` is available for the runtime factory.

