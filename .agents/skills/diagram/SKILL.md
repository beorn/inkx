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
| Trust that it "looks right" in the editor | Monospace width varies by font -- verify numerically |

---

## HTML/CSS Diagrams

Create publication-ready diagrams for blog posts and docs. **HTML/CSS is the primary tool** -- it gives full control over styling, layout, dark mode, and embeddability. D2 is useful for quick sketches and starting points, but doesn't produce blog-ready output on its own.

**The iteration is where the quality comes from.** Expect 5-10 rounds of refinement. The first version is never publishable.

### When to Use HTML/CSS

| What you're showing | Why HTML/CSS |
|---|---|
| Terminal zones, scrollback layers | Needs opacity, window chrome, realistic content |
| Terminal mockup (one screen) | Window chrome, monospace content, syntax colors |
| Pipeline / data flow comparison | Needs aligned grid layout, subtitles, consistent sizing |
| Side-by-side comparison | Bottom-aligned panels, matched heights |
| Multi-backend fan-out | Terminal-style screen buffer, code assertions |
| Screen grid / cell visualization | Colored cells, legends, summary stats |

For quick sketches / brainstorming, use **D2** first (`d2 --sketch --theme 0 --dark-theme 200 input.d2 output.svg`).

### Design System

**Colors (Okabe-Ito palette -- colorblind-safe):**

| Color | Hex | Typical use |
|---|---|---|
| Orange | `#E69F00` | Zone A / warning |
| Sky blue | `#56B4E9` | Zone B / active / focus |
| Bluish green | `#009E73` | Zone C / app-managed |
| Vermillion | `#D55E00` | Danger / terminal-owned |
| Blue | `#0072B2` | Zone D / primary |
| Reddish purple | `#CC79A7` | Zone E |
| Yellow | `#F0E442` | Highlight (low contrast on white -- use sparingly) |

Never use color alone to convey meaning (WCAG 2.1). Blue+orange is the safest 2-color combo. Avoid red+green together.

**Typography:**
- Terminal content: `'SF Mono', 'Fira Code', 'Cascadia Code', 'JetBrains Mono', 'Menlo', monospace` at 13px, line-height 1.85
- Labels/annotations: `'Inter', -apple-system, sans-serif` -- title 12.5px bold, details 11px, badges 10px

**Terminal syntax colors (Dracula-adjacent):** `.prompt` green, `.cmd` bright white, `.comment` gray, `.success` light green, `.keyword` purple, `.func` blue, `.string` yellow, `.bullet` cyan, `.dimmed` dim gray.

**Window chrome dots:** close `#ff5f57`, minimize `#febc2e`, maximize `#28c840`.

**Always include dark mode:**
```css
@media (prefers-color-scheme: dark) {
  body { background: #1a1a2e; }
  .annotation-card { background: #2a2a3a; }
}
```

### Building the Diagram

1. **Structure** -- HTML skeleton (zones, annotations, arrows), no styling yet
2. **Terminal content** -- realistic content from one continuous session, ghost zones with reduced opacity
3. **Annotation cards** -- floating white cards with numbered badge, title, bullet list, colored border
4. **Connectors** -- lines from zone edges to annotation cards (JS-computed widths)
5. **Transition arrows** -- vertical arrows between zones with text labels
6. **Boundary labels** (design docs only) -- technical markers

### Embedding in VitePress

Diagrams are embedded as **HTML fragments** (not full documents) via the `HtmlDiagram` Vue component in a **Shadow DOM** for CSS isolation.

- No `<!DOCTYPE>`, `<html>`, `<head>`, or `<body>` -- just `<style>` + `<div>`
- Scope all CSS with a unique class prefix (e.g. `.diagram-01-buffers`)
- Use responsive widths: `max-width: 660px; width: 100%`

```vue
<script setup>
import myDiagram from '../public/blog/diagrams/my-diagram.html?raw'
</script>
<HtmlDiagram :html="myDiagram" />
```

### Playwright Visual Verification (REQUIRED)

After embedding, verify with Playwright. Check: `box.width <= 688`, `scrollWidth == clientWidth`, `hasShadow == true`, `ulPadLeft == "0px"`, `termFontSize != "16px"`, `paddingLeft <= "10px"`. Read each screenshot with the Read tool for visual confirmation.

### Checklist Before Done

- Content tells one continuous story across zones
- Opacity creates clear visual hierarchy (ghost -> medium -> solid)
- Dark mode works
- No red+green as status indicators
- Width fits container (max-width + width:100%, no fixed px)
- Playwright visual verification passes

### Reference Implementations

| Diagram | Path |
|---|---|
| Three-Zone Scrollback | `~vault/terminal-scrollback-zones.html` |
| Buffer Comparison | `docs/public/blog/diagrams/01-buffers.html` |
| Pipeline Comparison | `docs/public/blog/diagrams/02-pipelines-compared.html` |
| Termless Fan-out | `docs/public/blog/diagrams/05-termless.html` |
| Clear-Redraw Cycle | `docs/public/blog/diagrams/06-clear-reprint.html` |
| Dirty Tracking Grid | `docs/public/blog/diagrams/07-dirty-tracking.html` |

### HTML/CSS Anti-Patterns

| Don't | Do Instead |
|---|---|
| Expect the first version to be good | Plan for 5-10 iteration rounds |
| Use D2/Mermaid as final output | Use as starting point, rebuild in HTML |
| Hardcode pixel positions for annotations | Use JS positioning that adapts to content |
| Skip dark mode | Always include `@media (prefers-color-scheme: dark)` |
| Use jargon in diagram labels | Simple words a non-expert can read in 3 seconds |
| Make diagrams too wide (920px) | 640-700px for most diagrams |
