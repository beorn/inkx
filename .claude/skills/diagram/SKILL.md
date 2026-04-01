---
description: "ASCII diagram creation — aligned boxes, trees, flow diagrams. Use when creating diagrams in markdown docs. Prevents the chronic misalignment bug."
argument-hint: [description of diagram to create]
---

# Diagram — Aligned ASCII Art

**LLMs cannot reliably align box-drawing characters by visual estimation.** Every box diagram you create will have misaligned borders unless you follow this protocol. This is not optional — it's a known limitation of token-by-token generation.

## The Task

$ARGUMENTS

## Decision: Which Format?

Pick the simplest format that works. **Markdown tables are hard to read in chat** — they only render well in .md files viewed in a renderer. Prefer trees and indented lists for anything shown in conversation.

**In chat / conversation:**
- Hierarchy → **Indented tree** (`├──`, `└──`)
- Structured data → **Indented key-value** or **labeled list**
- Flow / sequence → **Numbered list** with arrows
- Layered architecture → **Indented sections** with headers

**In .md files (rendered by GitHub/VS Code/VitePress):**
- Structured data → **Markdown table** (renders well)
- Comparison → **Markdown table**
- Everything else → same as chat rules above

**Box diagrams** → only when spatial layout genuinely matters (e.g., data flow with branching paths). Always use the box protocol below.

## Tree Diagrams (Safe — No Alignment Needed)

```
Root
├── Child A
│   ├── Grandchild 1
│   └── Grandchild 2
└── Child B
    └── Grandchild 3
```

Rules:
- `├──` for non-last children, `└──` for last child
- `│   ` (pipe + 3 spaces) for continuation lines
- `    ` (4 spaces) after `└──` for nested continuation
- No trailing comments that need alignment — put annotations on the next line if needed

## Box Protocol (When Boxes Are Required)

### Step 1: Write content lines WITHOUT borders first

```
APP — apps/ (@km/cli-app, @km/tui-app)
     Rendering, modals, user input
BOARD — @km/board
       Cursor, selection, navigation
```

### Step 2: Find the longest line

Use `wc -m` or count characters. Call this `W`.

### Step 3: Build the box

```
TOP:    ┌ + (W+2) × ─ + ┐
LINE:   │ + content + padding to (W+2) + │
SEP:    ├ + (W+2) × ─ + ┤
BOTTOM: └ + (W+2) × ─ + ┘
```

Every content line is: `│ ` + content + spaces to fill + ` │`
The space after `│` and before `│` is part of the (W+2) interior.

### Step 4: Verify with the validation command

After writing the box, run:

```bash
# Extract box lines and check all have same width
awk '/^[┌│├└]/' FILE.md | while IFS= read -r line; do
  printf '%d\n' "$(printf '%s' "$line" | wc -m)"
done | sort -u
```

**Must output exactly ONE number.** If it outputs multiple numbers, lines are misaligned — fix them.

### Step 5: Danger zones

Audit of 75 diagrams across km found **60% fail rate** — all caused by padding errors, not character width issues. Double-check padding on lines with:
- Dense punctuation: `"[ ]"|"[x]"|"[/]"` — looks wider than it is, so you under-pad
- Sparse content after dense lines — you over-compensate and over-pad
- Pipes inside content: `"p"|"h"|"code"` — visual noise confuses estimation
- Lines much shorter/longer than neighbors — these get the most padding errors

**Characters like `←`, `→`, `▼` are safe** (single-width in all Western monospace fonts). They don't cause misalignment — padding errors do.

## Side-by-Side Boxes (Avoid)

Side-by-side boxes are extremely hard to align. Use a table instead:

**Instead of:**
```
┌──────────┐    ┌──────────┐
│ Before   │ →  │ After    │
└──────────┘    └──────────┘
```

**Use:**
```
| Before | After |
|--------|-------|
| X      | Y     |
```

## External Tools

### Generation

**`graph-easy`** — Render graphs as ASCII/Unicode from simple syntax or Graphviz DOT:
```bash
nix-shell -p graph-easy
echo '[App] -> [Board] -> [Tree] -> [Storage]' | graph-easy
echo '[App] -> [Board]' | graph-easy --as=boxart   # Unicode borders
graph-easy --input=graph.dot --as_boxart            # From DOT file
```

**`boxes`** — Draw boxes around text (60+ built-in designs):
```bash
brew install boxes
echo "Hello World" | boxes -d stone
echo -e "Line 1\nLine 2" | boxes -d uniconsole      # Unicode box
```

**`mermaid-ascii`** — Render Mermaid flowcharts as ASCII art:
```bash
# Install: go install github.com/AlexanderGrooff/mermaid-ascii@latest
# Or download binary from https://github.com/AlexanderGrooff/mermaid-ascii/releases
echo "graph TD; A-->B-->C" | mermaid-ascii
mermaid-ascii --file diagram.mmd
```

**`boxen-cli`** — Node.js box drawing with border styles:
```bash
echo "Hello" | npx boxen-cli --border-style=double --padding=1
```

### Validation

**`ascii-guard`** — Dedicated ASCII box linter (auto-detects and fixes misalignment). **Primary validation tool.**
```bash
pip install ascii-guard                    # Python 3.10+, zero deps
ascii-guard lint docs/ARCHITECTURE.md     # Check
ascii-guard fix docs/ARCHITECTURE.md      # Auto-fix
ascii-guard fix --dry-run docs/guide.md   # Preview changes
```

**Inline validation** (no install needed, use when ascii-guard isn't available):
```bash
# Check all box lines in a file have equal width
awk '/^[┌│├└]/' FILE.md | while IFS= read -r line; do
  printf '%d\n' "$(printf '%s' "$line" | wc -m)"
done | sort -u
# Must output exactly ONE number
```

### Quick Reference

| Need | Tool | Install |
|---|---|---|
| Graph/flow to ASCII | `graph-easy` | `nix-shell -p graph-easy` |
| Box around text | `boxes` | `brew install boxes` |
| Mermaid to ASCII | `mermaid-ascii` | Go binary from GitHub |
| Validate alignment | `ascii-guard` | `pip install ascii-guard` |
| Programmatic boxes in JS | `boxen` | `bun add boxen` |
| UML to ASCII | `plantuml -utxt` | `brew install plantuml` |

## Anti-Patterns

| Don't | Do Instead |
|---|---|
| Visually estimate padding | Count characters or use validation command |
| Mix box-drawing with inline comments of varying length | Put annotations outside the box |
| Create side-by-side boxes | Use a markdown table |
| Use boxes for simple key-value data | Use a markdown table |
| Skip validation after creating a box | Always run the `awk` check |
| Trust that it "looks right" in the editor | Monospace width varies by font — verify numerically |
