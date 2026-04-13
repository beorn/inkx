---
description: "Audit a codebase for silvery alignment — philosophy, components, patterns, styling, runtime. Finds tarnished code and shows the shiny equivalent."
argument-hint: <file-or-directory> [--fix|--dry-run]
---

# Silverize — Is This Code The Silvery Way?

**Keywords**: silverize, silvery, tarnished, shiny, audit, alignment, components, the silvery way

Audit a file, package, or codebase against silvery's philosophy and technical standards. Finds code that fights the framework and shows the canonical silvery alternative.

## Auto-Activation

**Proactively suggest** `/silverize` (don't wait for the user to ask) after:
- Creating or modifying files in `examples/` (silvery showcase examples)
- Creating a new silvery component or example
- Completing work that touches silvery view components
- User asks to "clean up" or "improve" a TUI component

## Usage

```bash
/silverize vendor/terminfo.dev/cli/     # Audit a directory
/silverize apps/km-tui/src/views/       # Audit km views
/silverize src/app.tsx                   # Audit a single file
/silverize --fix src/app.tsx            # Audit + fix
/silverize --dry-run                    # Report only, no changes
```

## What This Is NOT

- Not a general code review (use `/code improve` for that)
- Not a bug hunt (use `/tests debug`)
- Not a style/lint check (use `bun fix`)

This is specifically about **silvery alignment** — are you using the framework as intended, or fighting it?

## Before You Start

**Read these first** (canonical references — don't duplicate their content, link to them):

- [The Silvery Way](vendor/silvery/docs/guide/the-silvery-way.md) — 10 principles with shiny/tarnished examples
- [Styling Guide](vendor/silvery/docs/guide/styling.md) — semantic colors, typography, theme tokens
- [silvery CLAUDE.md](vendor/silvery/CLAUDE.md) — architecture, packages, testing patterns

## Phase 1: Inventory

Scan the target for silvery-related patterns. Categorize every file:

| Category | What to look for |
|----------|-----------------|
| **React components** | `.tsx` files with JSX — check component patterns |
| **Styling** | Any color, formatting, or visual output |
| **Input handling** | Keyboard, mouse, focus management |
| **Layout** | Box sizing, positioning, overflow, scroll |
| **State** | State management approach |
| **Output** | How content reaches the terminal |
| **Testing** | How the code is tested |

## Phase 2: Audit Against The Silvery Way

**Read [The Silvery Way](vendor/silvery/docs/guide/the-silvery-way.md) first** — it defines the 10 principles with full shiny/tarnished code examples. Don't duplicate that content here. Instead, grep for these smell patterns:

```bash
# 1. Manual component reimplementation
grep -rn "useInput.*useState\|onKeyPress\|process\.stdin\.on" $TARGET

# 2. Manual layout (string padding instead of flexbox)
grep -rn "padEnd\|padStart\|' '.repeat\|\.repeat(" $TARGET

# 3. Manual scrolling (array slicing instead of overflow)
grep -rn "\.slice(\|offset.*visible\|scrollOffset.*Math" $TARGET

# 4. Chalk-level styling (should be React components with semantic tokens)
grep -rn '\\x1b\[\|\\033\[\|chalk\.\|kleur\.\|picocolors\|createStyle\|s\.bold\|s\.dim\|s\.green\|s\.red\|s\.yellow\|"red"\|"green"\|"yellow"\|#[0-9a-f]\{6\}' $TARGET

# 5. Manual terminal I/O + console.log for logging
grep -rn "process\.stdout\.write\|process\.exit\|\\x1b\[?1049\|\\x1b\[?25" $TARGET
grep -rn "console\.log\|console\.error\|console\.warn" $TARGET  # should be loggily or React

# 6. Fake cursor
grep -rn "inverse.*cursor\|cursor.*inverse\|fakeCursor\|cursorChar" $TARGET

# 7. God components
wc -l $TARGET/*.tsx 2>/dev/null | sort -rn | head -5  # files >200 lines

# 8. Wrong test level
grep -rn "toMatchSnapshot\|expect.*\\\\x1b" $TARGET

# 9. Hardcoded capabilities
grep -rn "kitty.*true\|truecolor.*true\|mouse.*true" $TARGET

# 10. Imperative mutations
grep -rn "ref\.current\.\|\.scrollTo\|\.focus()" $TARGET
```

For each hit, classify severity and note the silvery replacement (see The Silvery Way for the canonical fix).

### Anti-Patterns Quick Reference

For each finding, here's the tarnished pattern, why it's bad, and the shiny replacement:

**1. Manual key handlers instead of components**
```typescript
// Tarnished
useInput((input) => { if (input === "j") setIndex(i => i + 1) })
// Shiny — SelectList handles j/k, mouse, scroll, theming
<SelectList items={items} onSelect={handleSelect} />
```
Why: reimplements solved problems (scroll bounds, mouse, wrap-around, accessibility).

**2. Hardcoded ANSI codes**
```typescript
// Tarnished
process.stdout.write("\x1b[31mError\x1b[0m")
// Shiny
<Text color="$error">Error</Text>
```
Why: breaks in non-truecolor terminals, ignores NO_COLOR, loses theme adaptivity.

**3. `Box theme={{}}` for bg-only changes**
```typescript
// Tarnished — re-resolves ALL $tokens in the subtree
<Box theme={{ backgroundColor: "blue" }}>
// Shiny — direct prop, no cascade penalty
<Box backgroundColor="blue">
```
Why: `theme={{}}` triggers full token resolution on every child; `backgroundColor` is a simple prop.

**4. Raw color values instead of semantic tokens**
```typescript
// Tarnished
<Text color="#ff0000">Error</Text>
// Shiny
<Text color="$error">Error</Text>
```
Why: raw colors don't adapt to terminal themes or color schemes.

**5. `store.getState()` in tests**
```typescript
// Tarnished — couples to internal store shape
expect(store.getState().sel.node.cursor()).toBe("task1")
// Shiny — screen-observable assertion
expect(app.card("task1").isCursor).toBe(true)
```
Why: breaks on every internal refactor; 523 calls broke in one session.

**6. `createDriverTest` instead of `createTestApp`**
```typescript
// Tarnished
const { board, store } = createDriverTest(() => item("board", item("col", item("task"))))
// Shiny
using app = createTestApp(item("board", item("col", item("task"))))
```
Why: createDriverTest exposes store internals; createTestApp enforces screen-first testing.

**7. Snapshots without correctness assertions**
```typescript
// Tarnished — snapshot alone (detects change, not correctness)
app.press("jjH")
app.expectSnapshot()

// Shiny — typed assertions for correctness, snapshot for regression
app.press("jjH")
expect(app.card("task1b").isCursor).toBe(true)  // correctness: intent
expect(app.state.bell).toBe(1)                   // correctness: non-visible
app.expectSnapshot()                              // bonus: catch unintended drift
```
Why: snapshots detect *changes*, not *correctness*. A wrong snapshot stays wrong forever. Typed assertions express intent — they fail when behavior is wrong, even if the screen looks plausible.

## Phase 3: Check Technical Patterns

Beyond The Silvery Way (which covers principles), check these concrete patterns:

### Import Paths
```typescript
// Tarnished — internal package paths
import { SelectList } from "@silvery/ag-react/ui/components"
import { render } from "@silvery/ag-term"

// Shiny — barrel imports
import { SelectList, render } from "silvery"
```

### App Entry Point
```typescript
// Tarnished — manual setup
const term = createTerm()
process.stdout.write('\x1b[?1049h')  // manual alt screen
render(<App />, term)

// Shiny — zero-ceremony
import { render } from "silvery"
await render(<App />).run()
```

### Styling — All Roads Lead to React

Any string-level styling (`createStyle`, chalk, raw ANSI) is tarnished. Silvery apps use React components for ALL output.

```typescript
// Tarnished — ALL of these are chalk-level thinking
console.log(`\x1b[1m\x1b[32m✓\x1b[0m Done`)           // raw ANSI
console.log(`${s.bold.green("✓")} Done`)                // createStyle
console.log(chalk.bold.green("✓") + " Done")            // chalk

// Shiny — React components with semantic tokens
<Text><Text color="$success" bold>✓</Text> Done</Text>

// Shiniest — typography presets (see Styling Guide)
import { H2, Muted, P } from "silvery"
<Box flexDirection="column">
  <H2>Results</H2>
  <P>23/34 features passed</P>
  <Muted>Run npx terminfo.dev submit to contribute</Muted>
</Box>
```

**Detection**: grep for `createStyle`, `s.bold`, `s.dim`, `s.green`, `chalk.`, `kleur.`, `picocolors`, and raw `\x1b[`. ALL of these are tarnished in a silvery app. The fix is always the same: render with `run(<Component />, { mode: "inline" })` using `<Text>` with `$token` colors and typography presets.

**Typography presets** (from [Styling Guide](vendor/silvery/docs/guide/styling.md)): `H1`, `H2`, `H3`, `P`, `Lead`, `Muted`, `Small` — they handle color + weight + spacing automatically. Use these instead of manual `bold` + `color` combinations.

**Exception**: Low-level probe/terminal infrastructure that writes raw escape sequences to query the terminal (e.g., DA1 queries, cursor position reports). This is protocol, not UI — it stays raw.

### Logging — Use loggily, Not console.log

```typescript
// Tarnished — console.log for server/daemon output
console.log(`[${new Date().toISOString()}] Server started on port ${port}`)
console.error(`Failed to connect: ${err.message}`)

// Shiny — loggily structured logging
import { createLogger } from "loggily"
const log = createLogger("my-server")
log.info?.("server started", { port })
log.error?.("connection failed", { error: err.message })
```

`console.log` is for React-rendered UI output only (via silvery's `run()`). All non-UI logging (servers, daemons, background processes) should use `loggily`. It provides structured output, log levels, namespacing, and respects `DEBUG` env var.

**NEVER use loggily for CLI user output** — loggily adds timestamps and log levels (`23:04:31 INFO ...`) which makes help text, results, and prompts ugly. loggily is for machine-oriented server logs. CLI user output goes through either:
- `@silvery/commander` built-in help (`--help`, `addHelpText`)
- React inline rendering (`run(<View />, { mode: "inline" })`)
- Raw `console.log` for piped data (JSON, tables)

### Inline Mode (CLIs that aren't fullscreen)
```typescript
// Tarnished — console.log for interactive prompts
console.log("Pick one:")
const rl = readline.createInterface(...)

// Shiny — silvery inline mode
await run(<PickPrompt />, { mode: "inline" })
```

### CLI Argument Parsing
```typescript
// Tarnished — plain commander
import { Command } from "commander"

// Shiny — @silvery/commander (colorized help, Standard Schema validation)
import { Command } from "@silvery/commander"
```

`@silvery/commander` auto-colorizes `--help` output and adds full type inference. Features:
- Colorized section headings, command names, flags, argument brackets, console blocks (`$ ` prefix)
- Respects NO_COLOR / FORCE_COLOR automatically
- Standard Schema validation for option parsing (`port`, `csv`, `uint` presets)
- Typed positional args via inline syntax `command("deploy <service>")` OR explicit `.argument("<service>")` chains — both forms fully typed
- Two action handler forms: `.action((arg1, arg2, opts, cmd) => ...)` Commander-native, or `.actionMerged((params, cmd) => ...)` for flat destructured params
- `program.addHelpSection("title", rows)` with `$ ` console-block detection across all sections, multi-line terms with top-aligned descriptions
- Array-as-choices detection in `.option()`: `.option("-e, --env <e>", "Env", ["dev", "staging", "prod"])`

Don't write custom help views — let Commander's built-in `--help` do the work. Add extra sections with `addHelpSection()`.

**MANDATORY when converting to @silvery/commander**: If the old code had custom help text with examples, domain lists, or usage patterns, those MUST be preserved as `addHelpSection()` calls. Losing examples during a silverize conversion is a regression — the help output should be strictly better, never worse.

Checklist when replacing parseArgs/custom help:
- [ ] Examples section via `addHelpSection("Examples", ...)`
- [ ] Domain/category lists via `addHelpSection("Domains", ...)` if applicable
- [ ] `$ ` prefix on example lines (commander auto-detects and colorizes these)
- [ ] Run `<tool> --help` after conversion and compare with the old output
```typescript
program.addHelpSection("Examples", `
  $ npx terminfo.dev test          Test this terminal
  $ npx terminfo.dev submit        Test + submit results
`)
```

### Hyperlinks
```typescript
// Tarnished — raw OSC 8
process.stdout.write(`\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\`)

// Shiny — Link component or createStyle
import { Link } from "silvery"          // React component
import { link } from "@silvery/ansi"    // string helper
console.log(link(url, text))
```

### Resource Cleanup
```typescript
// Tarnished — manual cleanup + process.exit
const term = createTerm()
try { ... } finally { term.dispose(); process.exit(0) }

// Shiny — using + natural drain
using term = createTerm()
await render(<App />, term).waitUntilExit()
```

### Mouse Support
```typescript
// Tarnished — ignoring mouse entirely, or manual escape parsing
process.stdin.on("data", (d) => { if (d[0] === 0x1b && d[1] === 0x5b && d[2] === 0x4d) ... })

// Shiny — useMouseEvent hook or Box onClick
<Box onClick={() => handleClick()}>
  <Text>Click me</Text>
</Box>
```

### Theme / Dark Mode
```typescript
// Tarnished — hardcoded for dark terminals
const BG = "#1a1a2e"
const FG = "#ffffff"

// Shiny — theme tokens that adapt
<Box backgroundColor="$surface-bg">
  <Text color="$text-primary">Adapts to any theme</Text>
</Box>
```

## Phase 4: Scoring

Rate each file on a 1-5 scale:

| Score | Meaning |
|-------|---------|
| 5 | Fully silvery — canonical patterns, could be a docs example |
| 4 | Good — minor improvements (e.g., one hardcoded color) |
| 3 | Mixed — some silvery patterns, some manual |
| 2 | Mostly manual — using silvery as a renderer but fighting it |
| 1 | Anti-silvery — raw ANSI, manual everything, no framework leverage |

## Phase 5: Report

```markdown
## Silverize: <target>

### Overall: <score>/5

### Findings

| # | File | Score | Issue | Fix |
|---|------|-------|-------|-----|
| 1 | app.tsx | 2 | Manual ANSI escapes for colors | Use createStyle() |
| 2 | prompt.tsx | 1 | Manual useInput for list selection | Use SelectList |
| 3 | output.tsx | 3 | console.log but proper styling | Use run() inline mode |

### Quick Wins (fix now)
- Replace `\x1b[` with `createStyle()` in 3 files
- Replace manual list with `SelectList` in prompt.tsx

### Bigger Improvements (bead)
- Convert CLI output to silvery inline mode app
- Replace readline prompts with silvery components
```

## Phase 6: Fix (unless --dry-run)

Apply fixes in order of impact:
1. Import path fixes (mechanical, safe)
2. `createStyle()` replacements (mechanical, safe)
3. Component replacements (need testing)
4. Architectural changes (need discussion)

After each fix: verify with `tsc --noEmit` + targeted tests.

## When to Use

- After adding silvery to a project
- When a CLI uses `console.log` + ANSI but could use silvery
- When reviewing code that "works but feels wrong"
- Before a silvery release — ensure examples/demos are canonical
- After `/code improve` suggests silvery-specific improvements

## Phase 7: Code Quality (from /code quality)

After the silvery audit, run the [/code quality](../code/quality.md) strategic questions on the same target. Key checks:

**Abstraction quality** — What concept is this code modeling? Are there domain objects trying to emerge? What would this look like if it were easy?

**Simplicity** — Where are 10 lines doing what should be 1-2? If you deleted this and rewrote in 30 minutes, what would be different?

**Duplication** — What patterns repeat across functions/files? Each repetition is a missing abstraction.

**Interface design** — Do callers pass too many args? Do they always follow the same call sequence?

See [quality.md](../code/quality.md) Phase 2 for the full question set.

## Phase 8: Principles Audit (from docs/principles.md)

Check against [docs/principles.md](../../docs/principles.md) km conventions. Grep actionable guidelines:

```bash
grep '- \[ \]' docs/principles.md | head -20
```

Key checks:
- **Factory functions, not classes** — `class Foo` → `function createFoo()`
- **Inverted pyramid** — main export first, helpers after, types last
- **Alignment** — matching names enable `{ path }` shorthand
- **Fail loud** — no silent `catch {}`, no default fallbacks for programming errors
- **No prop drilling** — use context/DI, not threading props 5 levels deep
- **No hidden side effects** — functions named `getX()` should not mutate state
- **`using` cleanup** — not manual try/finally

## Phase 9: Combined Report

Merge all findings into one report with three sections:

```markdown
## Silverize: <target>

### Silvery Alignment: <score>/5
| # | File | Issue | Fix |
...

### Code Quality
| # | Category | Finding | Impact |
...

### Principles
| # | Principle | Violation | Fix |
...

### Quick Wins (fix now)
...

### Bigger Improvements (bead)
...
```

## Anti-Patterns

- Don't force silvery on non-interactive scripts (pure stdout tools are fine without silvery)
- Don't silverize test files (test infrastructure has different needs)
- Don't replace working `createStyle()` with full React components unless it adds value
- Don't make a file worse by adding silvery imports it doesn't need
- Don't duplicate `/code improve` checks — note them for follow-up, don't fix them in this pass
