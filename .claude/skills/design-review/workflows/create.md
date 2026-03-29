---
description: Design-first TUI screenshot creation — ASCII mockup → user approval → mechanical implementation → verification. Use when creating or redesigning showcase demos.
---

# Design-First Screenshot Workflow

Create polished TUI screenshots by designing at the text level first, then implementing mechanically. This avoids the "iterate blindly on code" trap where Claude can't visually verify its own work.

**Why this works**: ASCII mockups are text — Claude reads them perfectly, the user sees them perfectly, iteration is free/instant, and verification is just diffing TTY output against the mockup.

## Workflow

```
Step 1: Gather materials     →  component catalog, constraints, brief
Step 2: Generate ASCII mockup  →  send to LLM with design prompt
Step 3: User reviews mockup    →  iterate on TEXT (free, instant)
Step 4: Implement mechanically →  translate chars to React components
Step 5: Verify with TTY diff   →  compare output to mockup
Step 6: Review with Grok 4     →  honest benchmark ($0.03)
```

---

## Step 1: Gather Materials

Before asking an LLM to design, assemble these inputs:

### 1a. Component Catalog

Generate a live rendering of every available component. Run this in a TTY or paste into the prompt:

```
PROGRESS BARS
  Determinate:   ████████████████████░░░░░░░░░░  67%
  Full:          ██████████████████████████████ 100%
  Low:           ████░░░░░░░░░░░░░░░░░░░░░░░░░░  13%
  Indeterminate: ░░░░░░░████░░░░░░░░░░░░░░░░░░░

SPARKLINES (single-row history charts)
  Rising:    ▁▂▃▄▅▆▇█▇▆▅▄▃▂▁▂▃▄▅▆
  Flat high: ▇▇▇█▇▇▇█▇▇▇▇█▇▇▇▇▇▇▇
  Volatile:  ▂▆▁▇▃▅▂█▄▆▁▇▃▅▂█▄▆▁▇

TEXT STYLES
  Bold:      SECTION TITLE
  Muted:     secondary info, timestamps
  Small:     fine print, captions
  Color:     $success(green) $warning(yellow) $error(red) $primary(blue/cyan) $info(light blue)

INPUTS
  TextInput:   search: flutter widgets█
  Toggle:      [x] Dark mode  [ ] Notifications
  SelectList:  ▸ React    Vue    Svelte    Angular
  Button:      [ Deploy ]  [ Cancel ]

BORDERS (round style — the default)
  ╭──────────────────────────────────────────────╮
  │ Content with paddingX=1                      │
  │ More content                                 │
  ╰──────────────────────────────────────────────╯

SEPARATORS (inside panels)
  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄

LAYOUT CAPABILITIES
  - Flexbox: flexGrow proportional sizing, flexBasis=0 for equal columns
  - Gap: integer character gap between children
  - Padding: paddingX/paddingY inside borders (in characters)
  - Borders add 2 chars width (left │ + right │) and 2 rows height (top ─ + bottom ─)
  - Side-by-side: <Box flexDirection="row"> with gap={1} between panels
  - Stacked: <Box flexDirection="column"> for vertical stacking
  - wrap="truncate" prevents content overflow
```

### 1b. Exact Dimensions

Calculate the usable content area:
```
Terminal viewport: 137 cols × 43 rows (from 1100×700 px screenshot)
App banner:        137 × 2 rows (top — title + subtitle)
Status bar:        137 × 1 row (bottom — keybindings)
────────────────────────────────────────────
Usable content:    137 × 40 rows
```

### 1c. Design Brief

Write a 3-5 sentence brief:
- **What** is this demo? (system monitor, component gallery, text editor, kanban board)
- **Who** will see it? (developers evaluating the framework)
- **What should it prove?** (information density, component variety, layout flexibility)
- **Reference apps**: name 2-3 real apps it should resemble (btop, lazygit, k9s)
- **Feeling**: dense+professional, friendly+approachable, technical+precise

### 1d. Anti-Patterns (always include)

```
CONSTRAINTS — the design MUST follow these:
- Every row must have content. NO empty rows or blank areas.
- ProgressBars are single-row. NO multi-row charts (they overflow).
- Sparklines are single-row strings: ▁▂▃▄▅▆▇█ (max 60 chars wide).
- Borders use round style: ╭╮╰╯│─ (2 chars width, 2 rows height overhead).
- Content inside bordered panels has ~2 fewer cols and ~2 fewer rows than the panel.
- Separators: ┄┄┄┄┄ (single row, fills panel width minus padding).
- Right-align numbers. Pad labels to fixed width for column alignment.
- Leave 1 char padding between content and borders (paddingX=1).
```

---

## Step 2: Generate ASCII Mockup

Combine all materials into one prompt and send to an LLM.

### Model selection for mockup generation (benchmarked 2026-03-29)

| Model | Cost | Lines | Width accuracy | Design | Overall | Use when |
|-------|------|-------|---------------|--------|---------|----------|
| **GPT-5.4 Pro** | $0.80-2 | exact | exact (135) | 9/10 | Best | Final polish, budget allows |
| **Gemini 2.5 Pro** | $0.05 | off by 1 | 79-141 | 7/10 | Strong | Default choice — 16x cheaper than GPT Pro |
| **Claude Sonnet 4.6** | $0.08 | off by 5 | 128-192 | 6/10 | Decent | Quick drafts, iteration |
| **Gemini 2.5 Flash** | $0.01 | off by 1 | varies | 5/10 | OK | Very cheap drafts |
| **Grok 4** | $0.13 | ~correct | varies | 3/10 | Poor | Review/critique ONLY, not generation |

**Key finding**: No model except GPT-5.4 Pro nails exact character widths consistently.
All models produce usable layouts, but width/line precision requires manual cleanup or iteration.

**Recommended workflow**: Gemini 2.5 Pro for first draft → iterate at text level → GPT-5.4 Pro
only if Gemini output needs >3 rounds. For budget-sensitive work, Gemini Pro alone is sufficient
(fix widths manually during implementation).

### Prompt template

```
You are a terminal UI designer. Design a character-perfect ASCII mockup
for a {BRIEF} at exactly {COLS} columns × {ROWS} rows.

AVAILABLE COMPONENTS:
{COMPONENT_CATALOG}

CONSTRAINTS:
{ANTI_PATTERNS}

DESIGN BRIEF:
{BRIEF_TEXT}

REFERENCES: This should look as polished as {REFERENCE_APPS}.

Output ONLY the ASCII mockup inside a code block — exactly {COLS} chars
wide and {ROWS} lines tall. Every character matters. Use box-drawing
chars for borders (╭╮╰╯│─), block chars for bars (█░), sparkline chars
(▁▂▃▄▅▆▇█), and ┄ for separators. Include realistic demo data.

After the mockup, provide a component mapping table showing which
silvery component each visual element maps to.
```

### Send it

```bash
# Default — best value:
bun llm --model gemini-2.5-pro -y "{FULL_PROMPT}"
# Budget option:
bun llm --model gemini-2.5-flash -y "{FULL_PROMPT}"
# Maximum quality (expensive):
bun llm --model gpt-5.4-pro -y "{FULL_PROMPT}"
```

---

## Step 3: User Reviews Mockup

Present the ASCII mockup to the user. It's text — they can see every character.

Ask:
1. Does the layout use space well? Any empty areas?
2. Is the information hierarchy clear? (titles > data > labels)
3. Is the content realistic and interesting?
4. Does it showcase the framework's strengths?
5. Would you share this on Twitter?

**Iterate at the text level.** Modify the mockup directly (Edit tool on the output file) or re-prompt the LLM with specific changes. This is free and instant — no build/screenshot cycle.

Repeat until the user approves.

---

## Step 4: Implement Mechanically

Translate the approved mockup to React components. This is mechanical, not creative:

| Mockup element | Silvery component |
|---|---|
| `╭──────╮` `│` `╰──────╯` | `<Box borderStyle="round" borderColor="$primary" paddingX={1}>` |
| `████████░░░░  67%` | `<ProgressBar value={0.67} showPercentage />` inside `<Box flexGrow={1}>` |
| `▁▂▃▄▅▆▇█` | `sparkline(values, max)` inside `<Text>` |
| `┄┄┄┄┄┄┄` | `<Muted>{"┄".repeat(50)}</Muted>` |
| `CPU  Avg: 58%` | `<Text bold color="$primary">CPU</Text>` + `<LabelValue>` |
| `C0  [bar]  72%` | `<CpuCore>` with `<ProgressBar>` inside `<Box flexGrow={1}>` |
| Side-by-side panels | `<Box flexDirection="row" gap={1}>` with `flexGrow` ratios |
| Stacked panels | `<Box flexDirection="column">` |

### Key rules during implementation
- **Never use manual width calculations** — always `flexGrow={1}` for bars
- **Always `wrap="truncate"`** on any Box with text content
- **Sparklines use fixed length** (20 chars) — never dynamically sized
- **Test with TTY after each panel** — don't write the whole thing and hope

---

## Step 5: Verify with TTY Diff

After implementation — and **after every subsequent refactor** — verify the output matches the mockup.

### 5a. Capture baseline (first implementation)

```bash
# Start TTY at exact mockup dimensions
mcp__tty__start  # command: "bun <demo>", cols: 137, rows: 43
mcp__tty__wait   # stable
mcp__tty__text   # capture → save to /tmp/<demo>-baseline.txt
mcp__tty__stop
```

### 5b. Structural diff against mockup

Strip ANSI from the approved mockup and diff against the TTY text:

```bash
# Strip ANSI escape codes from mockup
sed 's/\x1b\[[0-9;]*m//g' vendor/silvery-internal/design/mockups/<demo>-mockup.ansi > /tmp/mockup-plain.txt

# Compare (ignore live data lines — CPU %, sparklines change each render)
diff /tmp/mockup-plain.txt /tmp/<demo>-baseline.txt
```

What must match exactly:
- Border characters (╭╮╰╯│─) and their positions
- Panel titles (` CPU / Compute `, ` Memory `, etc.)
- Static labels (Muted text: Load, Temp, Tasks, Used, Cache, etc.)
- Row count per panel

What will differ (live data — acceptable):
- CPU/memory percentages, sparkline patterns, process order
- Progress bar fill levels

### 5c. After refactoring

**MANDATORY:** Re-capture TTY text and diff against the baseline:

```bash
mcp__tty__start → mcp__tty__text → save to /tmp/<demo>-after.txt
diff /tmp/<demo>-baseline.txt /tmp/<demo>-after.txt
```

The diff should show ONLY live data changes (percentages, sparklines). Any structural change (missing border, moved label, changed padding) means the refactor broke something.

### 5d. Snapshot test (permanent regression guard)

Write a termless test that renders the component at the mockup dimensions and asserts structural invariants. This runs in `test:fast` and catches regressions automatically:

```tsx
using term = createTermless({ cols: 137, rows: 43 })
const handle = await run(<Dashboard />, term)
// Structural assertions — these never change
expect(term.screen).toContainText("CPU / Compute")
expect(term.screen).toContainText("Memory")
expect(term.screen).toContainText("Network")
expect(term.screen).toContainText("Processes")
expect(term.screen).toContainText("sorted by CPU%")
```

This is the **only reliable guard** against visual regressions after refactoring.

---

## Step 6: Review with Grok 4

Generate a 2x screenshot and send to Grok 4 for honest review:

```bash
# Generate 2x screenshot (must build first)
bun vendor/silvery/examples/web/build.ts
# Start docs server, use Playwright to capture 2200×1400

# Review
bun llm --model grok-4 --image screenshot-2x.png -y \
  "Brutally honest. Terminal UI showcase for TUI framework. Rate 1-10. No excuses."
```

Target: Grok 4 rates **8+/10**.

If below 8: read Grok's CRITICAL issues, go back to Step 2 or Step 3 to redesign.

---

## Example: Dashboard Design Brief

```
DESIGN BRIEF:
A btop-style system monitor dashboard showcasing Silvery's layout engine,
progress bars, sparklines, and text styling. Target: developers evaluating
the framework for their own TUI projects.

It should prove: information density (no wasted space), severity coloring
(green/yellow/red thresholds), real-time data feel (sparklines), and
professional polish (aligned columns, consistent borders).

References: btop, htop, bottom (Rust), zenith.
Feeling: dense, professional, information-rich, alive.

CONTENT:
- 8 CPU cores with progress bars and percentages
- Memory: RAM + Swap bars with breakdown
- Network: download/upload rates with sparklines
- Process table: 12+ rows with PID, name, CPU%, MEM%, status, time
- System info: uptime, load, temperature, frequency
- Status bar with keybindings
```
