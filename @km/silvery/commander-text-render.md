---
id: "@km/silvery/commander-text-render"
aliases:
  - km-silvery.commander-text-render
  - km-silvery-commander-text-render
created_by: claude:4929065a
created_at: 2026-04-02T08:06:51Z
closed_at: 2026-04-07T19:27:22Z
close_reason: "Implemented: tokenize.ts (private), styleSectionTerm refactored
  to use tokens, _renderSections handles multi-line terms with top-aligned
  descriptions, padWidth uses longest line. 26 new tests (21 tokenize + 5
  multi-line section). 220/220 commander tests pass. Vendored in
  silvery@1e50183, bumped in km root. No public API additions."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] @silvery/commander: refine the default text help renderer (stop-gap) @km/silvery #feature #P2 @Bjørn Stabell

# @silvery/commander: refine the default text help renderer

## Scope

**Stop-gap improvements to the default text renderer only.** Maximum Commander.js drop-in compatibility, zero new public API. The broader help-rendering overhaul (HelpModel IR, React integration, custom renderer hooks, slot/component patterns, multi-target rendering) is deferred to `km-silvery.commander-help-redesign` — that needs a proper design session before any code lands.

## What changes

### 1. Generalize `$ ` console-block detection across all sections

Today, `command.ts:styleSectionTerm()` detects shell commands (lines starting with `$ `) and applies multi-token styling (dim prompt, primary command name, secondary flags, accent brackets, dim quoted strings). This works in any `addHelpSection()` row whose term starts with `$ `.

The current logic is correct but the bead asks for it to be **explicit and consistent** — make sure every section that contains `$ ` lines gets the same treatment, document the convention, and make sure the existing test suite covers non-`Examples:` section names.

### 2. Multi-line console blocks with top-aligned descriptions

Allow `addHelpSection` row terms to be multi-line via `\n`:

```ts
program.addHelpSection("Quick Start:", [
  ["$ npm install foo\n$ foo init\n$ foo serve", "Set up a dev server"],
  ["$ foo build", "Build for production"],
])
```

Renders as:

```
Quick Start:
  $ npm install foo            Set up a dev server
  $ foo init
  $ foo serve

  $ foo build                  Build for production
```

The description column **top-aligns** to the first line of the multi-line term. Implementation: extend `_renderSections()` at `command.ts:596` to split multi-line terms, render each line with the existing `styleSectionTerm()` logic, and emit description text only on the first line. Padding (`padWidth()` at `command.ts:633`) needs to compute the longest LINE across all term lines, not just the longest term string.

### 3. Internal `tokenize.ts` for shell command parsing

The shell command tokenizer in `styleSectionTerm()` is currently inlined as a regex-driven token loop. Extract it to a private file `packages/commander/src/tokenize.ts`:

```ts
// PRIVATE — not exported from index.ts
export type CmdlineToken =
  | { kind: "prompt"; text: string }
  | { kind: "program"; text: string }
  | { kind: "subcommand"; text: string }
  | { kind: "flag"; text: string }
  | { kind: "arg-bracket"; text: string }
  | { kind: "quoted"; text: string }
  | { kind: "value"; text: string }
  | { kind: "whitespace"; text: string }

export function tokenizeCmdline(line: string): CmdlineToken[]
```

`styleSectionTerm()` becomes: `tokenize → map tokens to styled strings → join`. Cleaner than the current regex-loop. Faster to test (the tokenizer is a pure function with table-driven test cases).

**Not exported.** No public surface. If a future bead wants to expose it (for `<Cmdline>` component, multi-consumer use), that's a separate decision in `commander-help-redesign`.

### 4. Theme tokens via `@silvery/ansi`

Today's `colorize.ts` uses `@silvery/ansi`'s `createStyle()` to apply named colors (`s.primary()`, `s.secondary()`, `s.accent()`, etc.). The new tokenizer-based renderer should use the same theme tokens consistently — no hardcoded ANSI codes anywhere in the renderer.

This means: when km adopts a different theme later, help output reflects it automatically. No theme system changes needed in this bead — just discipline in not bypassing the existing token system.

## What does NOT change

- **Public API**: zero additions. No `helpSections` getter, no `setHelpRenderer`, no `HelpModel`, no `commanderToHelpModel`.
- **`addHelpSection` API**: unchanged. Same call signature, same behavior, just better default rendering.
- **`configureHelp({...})`**: unchanged. Users can still override `formatHelp` themselves via Commander's existing extension point.
- **Type safety**: unchanged. The `Command<Opts, Args, ArgsRecord>` types and `.action()` / `.actionMerged()` overloads from `commander-action-native` stay as-is.
- **`colorize.ts`**: unchanged for plain Commander users (`colorizeHelp(plainCommanderProgram)` still works the same).

## What is deferred

The whole React-rendered help story is deferred to `km-silvery.commander-help-redesign`:

- `HelpModel` IR design
- `<HelpView>` Silvery component
- `setHelpRenderer` vs `configureHelp({formatHelp})` ergonomics
- Pluggable `renderItem` components per section
- Dynamic content (functions returning rows at help-render time)
- Multi-target rendering (HTML for docs sites, markdown for READMEs)
- `<Cmdline>` component in `silvery/ui` and tokenizer extraction
- Custom slot system

Each of these has design questions that aren't ready to be answered yet. They get a proper /big or /csw session before any code lands.

## Acceptance

- All existing `@silvery/commander` tests pass (194 today)
- New tests for: multi-line `$ ` blocks, `$ ` detection in non-`Examples:` sections, theme token usage, top-aligned multi-line descriptions
- Snapshot tests of `km bd ready`, `terminfo probe --help`, and `termless backends --help` show improved console-block rendering
- No new public exports in `packages/commander/src/index.ts`
- `tokenize.ts` is a sibling of `command.ts` (not exported)

## Effort

~1 day. The bulk is the multi-line top-align logic in `_renderSections()` — needs careful padding math. The tokenizer extraction is a refactoring of existing code, ~1 hour. Tests + snapshots are most of the work.

## Related (closed/deferred)

- **closed**: `km-silvery.commander-examples` (subsumed — no separate API needed)
- **closed**: `km-silvery.commander-style-hooks` (obsoleted — new renderer doesn't depend on Commander 13+ style hooks)
- **closed**: `km-silvery.commander-action-native` (resolved 2026-04-07 — single `.action()` overload + explicit `.actionMerged()`)
- **deferred**: `km-silvery.commander-help-redesign` (the bigger React/IR/multi-target story)
- **orthogonal**: `km-silvery.commander-command-string-args` (input syntax, not output rendering)