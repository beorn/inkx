---
description: AI-powered visual design review — screenshots, pixel measurements, heuristic analysis. Use when reviewing UI design, checking alignment/spacing/margins, or auditing visual quality.
argument-hint: <url | path.png | directory/>
---

# Eye for Design

**Keywords**: design, visual, review, screenshot, alignment, spacing, margin, padding, UI, layout, contrast, symmetry, whitespace, design review

Analyze screenshots for visual design issues. Combines AI visual analysis, programmatic pixel measurement, and design heuristic evaluation.

## Usage

```
/design-review <url>              # Screenshot a URL and review
/design-review <path.png>         # Review an existing screenshot
/design-review <directory/>       # Review all PNGs in a directory
```

## Workflow

Parse `$ARGUMENTS` and determine the input type:

| Input | Detection | Action |
|-------|-----------|--------|
| URL (`http://` or `https://`) | String starts with `http` | Phase 1: Capture via Playwright |
| PNG/JPG file | File exists, image extension | Skip to Phase 2 |
| Directory | Path ends with `/` or is a directory | Glob for `*.png` / `*.jpg`, review each |
| TTY screenshot | User says "screenshot the terminal" | Use `mcp__tty__screenshot` or `mcp__peekaboo__see` |

---

## Phase 1: Capture

### From URL (Playwright)

```bash
bunx @playwright/cli@latest open "$URL"
bunx @playwright/cli@latest screenshot --filename=/tmp/design-review.png
bunx @playwright/cli@latest close
```

### From TTY

For terminal UI screenshots, use the TTY MCP:

```bash
# If a TTY session is running:
mcp__tty__screenshot   # Captures the active terminal session

# Or use Peekaboo for the live Ghostty window:
mcp__peekaboo__see     # Captures what's on screen
```

### From file

No capture needed. Verify the file exists with `ls`.

---

## Phase 1.5: Design Intent (CRITICAL — do this before measuring)

Before pixel-counting, establish the design context. Ask or determine:

### What is this?
- **Product type**: Marketing site? Developer docs? Dashboard? CLI tool? Demo/showcase?
- **Target audience**: Developers? End users? Executives? Mixed?
- **Primary goal**: Sell/convert? Teach? Enable workflow? Demonstrate capability?

### What feeling should it convey?
- **Professional & polished** — clean lines, generous whitespace, muted palette
- **Powerful & dense** — information-rich, compact, many features visible
- **Friendly & approachable** — warm colors, rounded corners, playful elements
- **Technical & precise** — monospace, grid-aligned, data-forward

### Design goals checklist
| Question | Why it matters |
|----------|---------------|
| Does a first-time viewer understand what this is in 3 seconds? | First impression / hero clarity |
| Is the primary action obvious? | Call-to-action visibility |
| Does it make me want to try it? | Emotional response / desirability |
| Does it look finished? | Polish / trustworthiness |
| Would I show this to a colleague? | Share-worthiness |
| Does it represent the product's actual quality? | Screenshot = promise, product = delivery |

### For showcase/demo screenshots specifically
- Does it showcase the product's best features?
- Would someone seeing this for the first time be impressed?
- Does the content feel real (not lorem ipsum / placeholder)?
- Is the data interesting enough to draw the eye?
- Does it look as good as competitors' screenshots?

**Include your design intent assessment in the report.** A pixel-perfect screenshot of a boring layout is still a bad screenshot.

---

## Phase 2: Measure

Run this Python script to extract quantitative layout data from each screenshot. The script uses PIL (Pillow) to measure margins, detect background color, compute content bounding box, and score symmetry.

```bash
python3 -c '
import sys, json
from PIL import Image
import numpy as np

def analyze_image(path):
    img = Image.open(path).convert("RGB")
    arr = np.array(img)
    h, w, _ = arr.shape

    # Detect background color (most common color in border region)
    border = np.concatenate([
        arr[0, :],           # top row
        arr[-1, :],          # bottom row
        arr[:, 0],           # left col
        arr[:, -1],          # right col
    ])
    bg_rgb = tuple(int(x) for x in np.median(border, axis=0))

    # Content bounding box: rows/cols that differ from background
    tolerance = 15
    diff = np.any(np.abs(arr.astype(int) - np.array(bg_rgb)) > tolerance, axis=2)

    rows_with_content = np.where(diff.any(axis=1))[0]
    cols_with_content = np.where(diff.any(axis=0))[0]

    if len(rows_with_content) == 0 or len(cols_with_content) == 0:
        return {"error": "No content detected", "bg_color": bg_rgb}

    top = int(rows_with_content[0])
    bottom = int(rows_with_content[-1])
    left = int(cols_with_content[0])
    right = int(cols_with_content[-1])

    margin_top = top
    margin_bottom = h - 1 - bottom
    margin_left = left
    margin_right = w - 1 - right

    # Symmetry score: 0 = perfectly symmetric, higher = more asymmetric
    h_asymmetry = abs(margin_left - margin_right)
    v_asymmetry = abs(margin_top - margin_bottom)

    # Symmetry as percentage of dimension (0% = perfect, 100% = max asymmetry)
    h_symmetry_pct = (h_asymmetry / max(w, 1)) * 100
    v_symmetry_pct = (v_asymmetry / max(h, 1)) * 100

    content_w = right - left + 1
    content_h = bottom - top + 1
    fill_pct = (content_w * content_h) / (w * h) * 100

    return {
        "image_size": {"width": w, "height": h},
        "bg_color_rgb": bg_rgb,
        "bg_color_hex": "#{:02x}{:02x}{:02x}".format(*bg_rgb),
        "content_bbox": {"top": top, "left": left, "bottom": bottom, "right": right},
        "content_size": {"width": content_w, "height": content_h},
        "margins": {
            "top": margin_top,
            "bottom": margin_bottom,
            "left": margin_left,
            "right": margin_right,
        },
        "symmetry": {
            "horizontal_diff_px": h_asymmetry,
            "vertical_diff_px": v_asymmetry,
            "horizontal_pct": round(h_symmetry_pct, 1),
            "vertical_pct": round(v_symmetry_pct, 1),
        },
        "fill_pct": round(fill_pct, 1),
    }

path = sys.argv[1]
result = analyze_image(path)
print(json.dumps(result, indent=2))
' "$IMAGE_PATH"
```

**Dependencies**: `python3` + `Pillow` + `numpy`. If not installed:

```bash
pip3 install Pillow numpy
```

### Reading the measurements

| Metric | Good | Flag | Block |
|--------|------|------|-------|
| Horizontal symmetry | < 2% | 2-5% | > 5% |
| Vertical symmetry | < 3% | 3-8% | > 8% |
| Fill percentage | 40-85% | 20-40% or 85-95% | < 20% or > 95% |
| Margin (any side) | > 4px | 1-4px | 0px (content touching edge) |

---

## Phase 3: AI Visual Review

Read each screenshot with the `Read` tool. Evaluate against this exhaustive checklist. **Be thorough — check every item. Report ALL issues found, no matter how small.**

### Layout & Spacing

| # | Check | What to look for |
|---|-------|------------------|
| 1 | **Margin symmetry** | Left ≈ right? Top ≈ bottom? Measure in pixels. |
| 2 | **Edge margins** | Content touching any edge (0px margin)? Minimum 1 character / 8px. |
| 3 | **Inner padding** | Padding inside borders/panels consistent? Same padding in all cards? |
| 4 | **Section gaps** | Vertical space between sections uniform? No double-gaps or missing gaps? |
| 5 | **Fill ratio** | Content fills available space? Large empty areas unexplained? |
| 6 | **Whitespace balance** | Neither cramped nor sparse? Breathing room between elements? |
| 7 | **Alignment grid** | Left edges of elements aligned? Columns aligned? Indentation consistent? |
| 8 | **Baseline alignment** | Text on the same row starts at the same vertical position? |
| 9 | **Centering** | Elements that should be centered actually are? No off-by-one? |

### Typography & Text

| # | Check | What to look for |
|---|-------|------------------|
| 10 | **Heading hierarchy** | H1 > H2 > H3 visually distinct? Bold/color/size differentiation? |
| 11 | **Text weight** | Bold used for emphasis, not for everything? Normal for body? |
| 12 | **Dim/muted text** | Secondary info appropriately dimmed? Not invisible, not too prominent? |
| 13 | **Text truncation** | Long text truncated with ellipsis? No text running past container? |
| 14 | **Text wrapping** | Text wraps at word boundaries? No mid-word breaks? |
| 15 | **Label alignment** | Labels and their values aligned? Colons/equals at consistent positions? |
| 16 | **Number alignment** | Numbers right-aligned or decimal-aligned? Percentages consistent width? |
| 17 | **Monospace consistency** | All text actually monospace? No proportional font artifacts? |

### Borders & Containers

| # | Check | What to look for |
|---|-------|------------------|
| 18 | **Border style consistency** | Same border style (single/round/double) used throughout? No mixing? |
| 19 | **Border completeness** | All four sides drawn? No missing bottom/right borders? |
| 20 | **Border overlap** | Nested borders not colliding? Proper gap between border and content? |
| 21 | **Border color** | Active/focused borders distinct from inactive? Selection visible? |
| 22 | **Container nesting** | Nested panels have clear visual separation? Not confusing depth? |

### Color & Contrast

| # | Check | What to look for |
|---|-------|------------------|
| 23 | **Semantic color usage** | Success=green, error=red, warning=yellow used correctly? |
| 24 | **Color consistency** | Same meaning → same color everywhere? No conflicting uses? |
| 25 | **Text contrast** | Text readable against background? Dim text not invisible? |
| 26 | **Background contrast** | Highlighted/selected elements clearly visible? |
| 27 | **Color count** | Not too many distinct colors (max 5-6)? Palette cohesive? |
| 28 | **Colorblind safety** | Status conveyed by shape AND color (✓/✗ + green/red)? |

### Rendering Defects

| # | Check | What to look for |
|---|-------|------------------|
| 29 | **Content overflow** | Any text or elements extending past their container? |
| 30 | **Content clipping** | Content cut off at bottom or right? Missing characters? |
| 31 | **Rendering artifacts** | Stray characters, ghost borders, misaligned box-drawing chars? |
| 32 | **Wide character handling** | CJK, emoji, or special chars causing alignment issues? |
| 33 | **Crosshatch/fill patterns** | Progress bar fills look clean? No noisy/rough patterns? |
| 34 | **Cursor artifacts** | Visible cursor in wrong position? Block cursor over content? |
| 35 | **Scroll indicators** | Scrollbar/scroll arrows visible when content overflows? |

### Interaction Indicators

| # | Check | What to look for |
|---|-------|------------------|
| 36 | **Selection highlight** | Selected item clearly visible? Highlight spans full width? |
| 37 | **Focus indication** | Focused panel/input visually distinct? Border color change? |
| 38 | **Active tab** | Active tab clearly indicated? Inactive tabs visibly different? |
| 39 | **Disabled state** | Disabled items visually distinct? Dimmed or struck through? |

### Higher-Level Design

| # | Check | What to assess |
|---|-------|---------------|
| 40 | **First impression** | What do you notice first? Is that the right thing to notice? |
| 41 | **Emotional response** | Professional? Impressive? Boring? Broken? Would you trust this software? |
| 42 | **Content quality** | Demo content compelling and real-feeling? Or placeholder/lorem ipsum? |
| 43 | **Information density** | Right amount of info? Too sparse (wasted space) or too dense (overwhelming)? |
| 44 | **Visual rhythm** | Consistent repeating pattern? Or jarring/random element placement? |
| 45 | **Showcase effectiveness** | Does this make someone want to use the product? |
| 46 | **Competitive quality** | Would this hold up next to screenshots from competing frameworks? |
| 47 | **Twitter test** | Would you share this on social media? If not, what's missing? |

**When using external LLMs** (Grok, GPT), include this checklist in the prompt and ask them to:
1. Check every item on this list
2. Add any issues they find that AREN'T on this list
3. Suggest specific fixes for each issue
4. Rate overall quality 1-10

**For each check**, determine a verdict:

| Verdict | Meaning |
|---------|---------|
| **BLOCK** | Looks broken, unfinished, or significantly impacts usability |
| **FLAG** | Noticeable but not critical — polish item |
| **OK** | Passes this heuristic |

---

## Phase 4: Report

Output a structured markdown report:

```markdown
## Design Review: <filename>

### Design Intent
- **What is this**: <product type, context>
- **Target audience**: <who sees this>
- **Goal**: <what it should achieve>
- **Desired feeling**: <professional / powerful / friendly / technical>
- **First impression**: <what you actually feel looking at it>

**Image**: <width> x <height> px
**Background**: <hex color>
**Content fill**: <fill_pct>%

### Measurements

| Margin | Pixels | Symmetry |
|--------|--------|----------|
| Top    | Npx    |          |
| Bottom | Npx    | V: Npx diff (N%) |
| Left   | Npx    |          |
| Right  | Npx    | H: Npx diff (N%) |

### Findings

| # | Heuristic | Verdict | Detail |
|---|-----------|---------|--------|
| 1 | Margin symmetry | OK/FLAG/BLOCK | Specific observation with px values |
| 2 | Visual balance | ... | ... |
| ... | ... | ... | ... |

### Summary

- **BLOCK** (N): <list>
- **FLAG** (N): <list>
- **OK** (N): <list>

### Suggested Fixes

1. <Specific actionable fix with pixel values or code reference>
2. ...
```

---

## Optional: Multi-LLM Review

For a second opinion on visual design, use `/llm`:

```bash
# Quick visual critique from another model
bun llm "Review this UI screenshot for design issues. The image shows: <describe what you see in detail — layout, colors, spacing, text hierarchy>. Measurements: <paste Phase 2 JSON>. What design problems do you notice?"

# Deep design research
bun llm --deep -y "Best practices for terminal UI design: spacing, color, typography, layout"
```

When using `/llm`, describe the screenshot in detail since other models cannot see the image directly. Include the Phase 2 measurement data to give them concrete numbers to work with.

### Best reviewers (ranked by design review quality)

| Reviewer | Can see images? | Quality | How to use |
|---|---|---|---|
| **v0.dev** (web) | Yes | Best — catches rendering bugs, truncation, data corruption | Manual: upload screenshot at v0.dev/chat |
| **Claude** (built-in) | Yes | Excellent — Read tool shows images directly | `Read /path/to/screenshot.png` |
| **Grok 3** | Text only via /llm | Good — most detailed text reviews (7/10 benchmark winner) | `bun llm --model grok-3` |
| **GPT-5.4** | Text only via /llm | Good — concise, actionable | `bun llm --model gpt-5.4` |
| **GPT-4o** | Text only via /llm | Good — cheapest, fastest | `bun llm --model gpt-4o` |

**Key insight**: Models that can see the actual image catch rendering defects (truncated text, data corruption, misaligned columns) that text-description-based reviews miss entirely. Always use at least one visual reviewer.

**v0.dev workflow**: Upload the screenshot at v0.dev/chat and ask for a UI design evaluation. v0 uses Claude under the hood with vision, and is specifically tuned for UI critique. It caught truncation bugs, data corruption, and inconsistent color usage that 3 other LLMs all missed from text descriptions.

**Future**: Add `--image` flag to `/llm` tool to send base64-encoded images directly to GPT/Gemini/Grok vision APIs. This would enable automated visual review without manual uploads.

---

## Terminal UI Design Principles

Compact reference for evaluating terminal UIs (the primary use case for km):

### Spacing
- 1-2 character padding inside borders and containers
- 1 empty line between logical sections
- Consistent gutter width between columns
- No content touching the terminal edge (min 1 char margin)

### Typography
- **Bold** for headings, section titles, active/focused elements
- Normal weight for body text and data
- **Dim** (`$muted`) for secondary info, timestamps, metadata, disabled items
- Monospace alignment: use fixed-width columns, pad with spaces

### Color
- Semantic tokens only: `$primary`, `$success`, `$error`, `$warning`, `$muted`
- `cyan` background reserved for selection (+ black foreground)
- `inverse` reserved for input cursor
- Color AND shape for status (colorblind-safe): done = green + checkmark, error = red + X
- Avoid more than 4-5 distinct colors on screen simultaneously

### Layout
- Content should fill available space (no large empty rectangles)
- Borders should be consistent style throughout (single-line, double-line, or none — don't mix)
- Column headers should align with column content
- Truncation with ellipsis rather than wrapping when horizontal space is tight
- Scroll indicators when content overflows vertically

### Hierarchy
- Primary content (the thing you're working on) gets the most space
- Secondary content (sidebar, status bar) gets minimal space
- Interactive elements should be visually distinct from static text
- Focus indicators should be immediately obvious (not subtle)

---

## See Also

- [tui/design.md](../tui/design.md) — km TUI design system (colors, selection, icons)
- [The Silvery Way](../../../vendor/silvery/docs/guide/the-silvery-way.md) — canonical component patterns
- [Silvery Styling](../../../vendor/silvery/docs/guide/styling.md) — semantic theme tokens
- [explore/peekaboo.md](../explore/peekaboo.md) — live Ghostty terminal inspection
- [playwright-cli/SKILL.md](../playwright-cli/SKILL.md) — browser automation for web screenshots
