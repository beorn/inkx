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

Read each screenshot with the `Read` tool. Evaluate against these design heuristics:

| # | Heuristic | What to check |
|---|-----------|---------------|
| 1 | **Margin symmetry** | Are margins roughly equal on opposite sides? Left ~= right, top ~= bottom? |
| 2 | **Visual balance** | Is content centered or intentionally aligned? Does it feel weighted to one side? |
| 3 | **Whitespace** | Too cramped (elements touching, no breathing room)? Too empty (large unused areas)? |
| 4 | **Alignment** | Are elements on a consistent grid? Do left edges line up? Do baselines align? |
| 5 | **Hierarchy** | Are headings visually distinct from body text? Is the primary action obvious? |
| 6 | **Color consistency** | Are semantic colors used correctly? Same meaning = same color throughout? |
| 7 | **Contrast** | Is text readable against its background? Are borders visible but not dominant? |
| 8 | **Overflow/clipping** | Any content cut off? Text running past its container? Scrollbar where there shouldn't be one? |
| 9 | **Spacing consistency** | Are gaps between sections uniform? Same padding inside all cards/panels? |
| 10 | **Visual grouping** | Are related elements visually grouped (proximity, borders, background)? Are unrelated elements separated? |

**For each heuristic**, determine a verdict:

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
