---
mentions:
  - km
id: "@km/silvery/compat"
aliases:
  - km-silvery.compat
  - km-silvery-compat
created_by: claude:55df8ef1
created_at: 2026-03-09T18:10:58Z
closed_at: 2026-03-09T19:12:50Z
close_reason: Implemented silvery/ink and silvery/chalk subpath exports. Ink
  compat re-exports Box, Text, render, useInput, useApp, useFocus,
  useFocusManager, etc. Chalk compat provides default export, Chalk constructor,
  supportsColor, name lists. TypeScript compiles clean.
owner: bjorn@stabell.org
---

# [x] silvery/compat: ink + chalk API compatibility subpath @km/silvery #feature #P3

Full ink + chalk API compatibility via subpath exports from the silvery root package.

Source lives in `packages/compat/` (not published separately — exported through root).

## Repo layout

```
silvery/
├── package.json              ← name: "silvery"
├── src/index.ts              ← re-exports @silvery/* packages
├── packages/
│   ├── react/                ← @silvery/react
│   ├── term/                 ← @silvery/term
│   ├── ansi/                 ← @silvery/ansi
│   ├── ...
│   └── compat/               ← NOT a separate npm package
│       ├── chalk.ts
│       └── ink.ts
```

## Subpath exports (in root package.json)

```json
{
  ".": "./src/index.ts",
  "./chalk": "./packages/compat/chalk.ts",
  "./ink": "./packages/compat/ink.ts"
}
```

## Usage

```ts
// Native silvery API
import { Box, Text, render, createTerm } from 'silvery'

// Ink drop-in — just change the import path
import { render, Box, Text, useInput, useFocus } from 'silvery/ink'

// Chalk drop-in — just change the import path
import chalk from 'silvery/chalk'
```

## Ink compat (silvery/ink → packages/compat/ink.ts)

- `useFocus()` → wraps `useFocusable()`
- `useFocusManager()` → wraps `createFocusManager()`
- `useStdin()`, `useStdout()`, `useStderr()` → wraps `useTerm()`
- `renderToString()` → alias for `renderStatic()`
- `measureElement()` → already exported natively
- Render options: `exitOnCtrlC`, `patchConsole`, `debug`

## Chalk compat (silvery/chalk → packages/compat/chalk.ts)

- Default export `chalk` with identical chainable API
- `new Chalk({ level })` constructor
- `chalk.level` property (0-3)
- `supportsColor` / `supportsColorStderr`
- `modifierNames`, `foregroundColorNames`, `backgroundColorNames`, `colorNames`
- Tagged template literal (low priority)

## Native API kept as-is (better than ink/chalk)

- `useTerm()` > `useStdin/useStdout/useStderr`
- `createTerm()` > `new Chalk()`
- `useContentRect/useScreenRect` > `measureElement`
- `useFocusable()` > `useFocus()`

