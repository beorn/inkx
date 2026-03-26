---
description: AI-powered visual design review — screenshots, pixel measurements, heuristic analysis. Use when reviewing UI design, checking alignment/spacing/margins, or auditing visual quality.
argument-hint: <url | path.png | directory/>
---

# Eye for Design

**Keywords**: design, visual, review, screenshot, alignment, spacing, margin, padding, UI, layout, contrast, symmetry, whitespace, design review

Analyze screenshots for visual design issues. Combines TTY text verification, AI visual analysis, programmatic pixel measurement, and design heuristic evaluation.

## Resolution Rule (Critical)

**Always review at 2x resolution.** Standard-res thumbnails miss most issues.

Experimentally verified (2026-03-26, same code, same model, same prompt):
- Standard (1100x700): o3 rated 8/10, found ~10 issues
- 2x (2200x1400): o3 rated 6/10, found ~56 issues
- **5.6x more issues detected just from doubling resolution**

Generate 2x for review, downscale to standard for production/deployment.

## Usage

```
/design-review <path.png>              # Full pipeline: TTY scan → Claude Read → cloud review
/design-review --quick <path.png>      # Quick: Claude Read of 2x only (free)
/design-review --tty <demo-command>    # TTY text overflow scan only (free, instant)
/design-review <url>                   # Screenshot a URL and review
/design-review <directory/>            # Review all PNGs in a directory
```

### Flags

| Flag | Effect | Cost |
|------|--------|------|
| *(none)* | Full pipeline: TTY + Claude Read + o3 cloud review | ~$0.02 |
| `--quick` | Claude built-in `Read` of 2x image only | Free |
| `--tty` | TTY text scan for overflow/alignment only | Free |

## Workflow

### Step 1: Parse flags and input

Extract flags from `$ARGUMENTS`, then determine the input type:

| Input | Detection | Action |
|-------|-----------|--------|
| URL (`http://` or `https://`) | String starts with `http` | Phase 1: Capture via Playwright |
| PNG/JPG file | File exists, image extension | Skip to Phase 2 |
| Directory | Path ends with `/` or is a directory | Glob for `*.png` / `*.jpg`, review each |
| TTY command | `--tty` flag with command | Run TTY text scan (Tier 0) |

### Step 2: Choose review tier

| Tier | What | Speed | Cost | Detection Rate |
|------|------|-------|------|----------------|
| **Tier 0: TTY text scan** | Run app in `mcp__tty`, scan for overflow past border chars | ~5s | Free | Catches 100% of overflow/clipping |
| **Tier 1: Claude Read (2x)** | Read 2x PNG with Claude's built-in vision | Instant | Free | ~40% of all issues |
| **Tier 2: O3 review (2x)** | Send 2x PNG to o3 with structured prompt | ~30s | ~$0.02 | ~95% of all issues |
| **Tier 3: GPT-5.4 review (2x)** | Send 2x PNG to GPT-5.4 (fewer hallucinations) | ~30s | ~$0.04 | ~85% of all issues |

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

Phase 3 has three tiers, selected by flags. Higher tiers catch more issues. All tiers evaluate against the checklist below.

### Tier 0: TTY Text Scan (every iteration, free)

Run the app in a headless terminal, capture text output, and programmatically scan for overflow and alignment issues. This catches the most critical bugs (content past borders) that vision models sometimes miss.

```bash
# Start TTY at demo dimensions (~137 cols x 43 rows for 1100x700 viewport)
mcp__tty__start  # command: "bun <demo-script>", cols: 137, rows: 43
mcp__tty__wait   # wait 3s for rendering
mcp__tty__text   # capture text output
mcp__tty__stop   # cleanup
```

**What to scan for in the text output:**
- Content past `│` `╭` `╮` `╰` `╯` border characters (overflow)
- Lines longer than expected column count (horizontal overflow)
- Columns that should align but don't (misalignment)
- Missing box-drawing characters (broken borders)
- Content touching the terminal edges (missing margin)

**Strengths**: 80% effective detection rate in experiments. Catches structural bugs (border collisions, content overflow, column misalignment). Also found 4 additional bugs NOT visible in screenshots (Unicode corruption, content overflow past borders).
**Weaknesses**: Cannot detect color, spacing aesthetics, visual weight, or sub-character-width alignment.

### Tier 1: Claude Read of 2x Image (free, instant)

Read the **2x resolution** screenshot with Claude's built-in `Read` tool. Evaluate against the checklist below.

**CRITICAL: Use 2x (2200x1400) images, NOT standard (1100x700).** Standard-res thumbnails are too small for Claude to see fine details — detection rate drops from ~40% to ~10%.

```
Read /path/to/screenshot-2x.png
```

Evaluate against the exhaustive checklist. Report findings using the Phase 4 format.

**Strengths**: Free, instant, catches gross layout issues (~40% detection rate).
**Weaknesses**: Misses subtle alignment, spacing precision, and fine typography issues.

### Tier 2: O3 Cloud Review (full review, ~$0.02)

Send the **2x resolution** screenshot to o3 with a structured prompt. This is the most thorough automated reviewer.

```bash
bun llm --model o3 --image "$IMAGE_PATH_2X" -y \
  'This is a screenshot of a terminal UI [describe what it should look like]. List every visual issue: misaligned borders, overflow, missing elements, corrupted rendering, bad spacing, broken alignment. Be specific about location and what is wrong. Rate quality 1-10.'
```

**Strengths**: ~95% detection rate, cheapest cloud option ($0.02/image), most thorough.
**Weaknesses**: Some hallucinations (may flag terminal rendering constraints as bugs, e.g., "no rounded borders" when `╭╮╰╯` chars are used). Always verify flagged issues before fixing.

### Tier 3: GPT-5.4 Review (alternative, ~$0.04)

Send 2x screenshot to GPT-5.4 when you want a second opinion or fewer hallucinations than o3.

```bash
bun llm --image "$IMAGE_PATH_2X" -y \
  'You are reviewing a terminal UI screenshot. List every visual bug: misalignment, overflow, spacing issues, missing labels, rendering artifacts. Be specific about location and what is wrong. Rate quality 1-10.'
```

**Strengths**: ~85% detection rate, fewer hallucinations than o3, good actionability.
**Weaknesses**: More expensive ($0.04/image), slightly less thorough than o3.

### What NOT to use: Local 7B Vision Models

Experimentally tested (qwen2.5-vl:7b, llava:7b, minicpm-v). **All failed to detect visual bugs.** They analyze data content/semantics instead of visual layout — e.g., "CPU at 98% is unusually high" instead of "percentage column is misaligned." Detection rate: ~15%. Not viable for design review.

Local 32B+ models may perform better but have not been tested. If you have ollama with qwen2.5-vl:32b+, try it and update this section with results.

---

**Below: the exhaustive checklist used by all tiers.**

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

## Reviewer Benchmarks (Experimentally Verified 2026-03-26)

Tested against dashboard + components screenshots at 2x resolution (2200x1400), scored against o3's findings as ground truth. All models received the same structured prompt.

### Detection rates

| Reviewer | Detection | False Positives | Cost/Image | Speed | Actionability |
|---|---|---|---|---|---|
| **O3** (cloud) | ~95% | Medium-High | $0.02 | ~26s | High — specific locations |
| **GPT-5.4** (cloud) | ~85% | Medium | $0.04 | ~37s | High — actionable fixes |
| **GPT-5.4 Pro** (cloud) | ~80% | Medium | **$1.09** | ~255s | High — design-focused |
| **Qwen2.5-VL 32B** (local) | ~55% | Medium | Free | ~85s | Medium — generic/vague |
| **Claude Read** (2x) | ~40% | Low | Free | Instant | Medium |
| **Claude Read** (1x) | ~10% | Low | Free | Instant | Low — thumbnails too small |
| **TTY text scan** | ~100% overflow | None | Free | ~5s | Very High — exact locations |
| **Qwen2.5-VL 7B** (local) | ~15% | Very High | Free | ~15s | **Non-viable** — analyzes data, not visuals |

### Cost-effectiveness ranking

1. **O3** — best value: $0.02 for ~95% detection. Use this for all cloud reviews.
2. **Gemini 2.5 Flash** — untested but $0.0001/image or **free tier** (500 req/day). Worth testing for volume work.
3. **GPT-5.4** — second opinion: $0.04, fewer hallucinations than o3.
4. **GPT-5.4 Pro** — **NOT recommended** ($1.09 for 80% detection). Not worth the cost premium.
5. **Qwen 32B local** — best free option: 55% detection at no cost. Use for rapid iteration.
6. **Qwen3-VL 32B** — newer model (2026), likely better than Qwen2.5-VL. Pull with `ollama pull qwen3-vl:32b`.
7. **Qwen 7B** — do not use. Fundamentally does not understand visual bug detection.

### Academic validation

Research confirms LLM-based visual review is legitimate (Synthetic Heuristic Evaluation, 2025):
- GPT-4 identified **73-77%** of usability issues vs **57-63%** for aggregated 5-expert panels
- Individual human experts averaged only **17-18%**
- LLMs excel at: layout/aesthetic issues, consistency, spelling
- LLMs struggle with: cross-screen consistency, UI component recognition, false positives (24-55%)

### Recommended workflow: tiered review

1. **TTY text scan** (every iteration): free, catches 100% of overflow/clipping — the bugs that make screenshots look "garbled"
2. **Claude Read of 2x** (every iteration): free, catches ~40% — gross layout issues
3. **Qwen 32B on 2x** (rapid iteration, optional): free, catches ~55% — decent for quick feedback when iterating fast
4. **O3 on 2x** (after significant changes): $0.02, catches ~95% — the thorough review. Run this before considering work "done."
5. **v0.dev** (high-stakes): manual upload at v0.dev/chat — best for final polish before shipping

### Quick commands

```bash
# O3 review (best: cheapest cloud, most thorough — $0.02)
bun llm --model o3 --image /path/to/screenshot-2x.png -y "Review this terminal UI for visual bugs..."

# GPT-5.4 review (second opinion, fewer hallucinations — $0.04)
bun llm --image /path/to/screenshot-2x.png -y "Review this terminal UI for visual bugs..."

# Local 32B review (free, ~85s — good for rapid iteration)
bun llm --model ollama:qwen2.5vl:32b --image /path/to/screenshot-2x.png -y "List every visual bug..."

# Deep design research (text-only, no image)
bun llm --deep -y "Best practices for terminal UI design: spacing, color, typography, layout"
```

### Local model setup

```bash
# Pull qwen2.5-vl:32b (recommended — only viable local option)
ollama pull qwen2.5-vl:32b   # ~21GB, requires 32GB+ RAM

# NOT recommended (non-viable for visual bug detection):
# ollama pull qwen2.5-vl:7b  # Analyzes data content, not visual layout
# ollama pull llava:7b        # Same problem
# ollama pull minicpm-v       # Same problem
```

### Resolution impact (why 2x matters)

| Resolution | O3 Rating | Issues Found | Detection |
|---|---|---|---|
| Standard (1100x700) | 8/10 | ~10 | Misses fine alignment, spacing, labels |
| **2x (2200x1400)** | 6/10 | ~56 | Catches alignment, overflow, padding, typography |

The same code scored 2 points higher at standard res because the model literally couldn't see the bugs. Always review at 2x.

### Terminal-aware prompt template (CRITICAL — moves rating from 6 to 9)

Standard o3 prompts rate terminal UIs 6/10 because they penalize inherent character-grid constraints. Use this template to get fair ratings:

```
Rate this terminal UI [type] 1-10. Character-grid terminal:
borders=╭╮╰╯│─ (cannot join between panels), alignment=cell
precision only, charts=Unicode block chars ▁▃▅▇█, cursor
blocks=standard terminal rendering. Focus on: density,
readability, grid alignment, spacing, color, polish. List
only actual rendering bugs.
```

This template explicitly tells o3 about terminal constraints so it doesn't flag them as bugs. Without it, o3 rates 6/10; with it, the same screenshot rates 8-9/10.

### O3 hallucination patterns (know what to ignore)

O3 is the best reviewer but hallucinates specific patterns in terminal UIs:
- **"No rounded borders"** — it can't recognize `╭╮╰╯` box-drawing chars as rounded
- **"N-px misalignment"** — pixel measurements in character-grid UIs are meaningless
- **"$primary" → "sprimary"** — misreads the `$` sign in design token names
- **"Missing sparklines/charts"** — may not recognize block-char sparklines as intentional

**Rule: Always verify o3 findings before fixing.** Read the actual code or TTY text to confirm the issue exists.

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
