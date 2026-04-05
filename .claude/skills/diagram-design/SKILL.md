---
description: "Create polished HTML/CSS diagrams for blog posts and docs. Terminal mockups, architecture flows, zone diagrams with annotations. Produces dark-mode-ready, embeddable HTML."
argument-hint: [description of what the diagram should show]
---

# Diagram Design — Polished Technical Diagrams

Create publication-ready diagrams for blog posts and docs. **HTML/CSS is the primary tool** — it gives full control over styling, layout, dark mode, and embeddability. D2 is useful for quick sketches and starting points, but doesn't produce blog-ready output on its own.

**The iteration is where the quality comes from.** Expect 5-10 rounds of refinement. The first version is never publishable. Starting points (D2 sketch, Cowork/Claude Artifacts, rough HTML) save time on structure, but every diagram needs manual iteration on spacing, colors, alignment, content, and terminology.

External tools (Figma Make, Cowork, Claude Artifacts) can generate an initial HTML version. Then iterate on it directly — editing the HTML/CSS file and checking in a browser.

## The Task

$ARGUMENTS

## Decision: Which Tool?

| What you're showing | Tool | Why |
|---|---|---|
| Terminal zones, scrollback layers | **HTML/CSS** | Needs opacity, window chrome, realistic content |
| Terminal mockup (one screen) | **HTML/CSS** | Window chrome, monospace content, syntax colors |
| Pipeline / data flow comparison | **HTML/CSS** | Needs aligned grid layout, subtitles, consistent sizing |
| Side-by-side comparison | **HTML/CSS** | Bottom-aligned panels, matched heights |
| Multi-backend fan-out | **HTML/CSS** | Terminal-style screen buffer, code assertions |
| Screen grid / cell visualization | **HTML/CSS** | Colored cells, legends, summary stats |
| Quick sketch / brainstorming | **D2** | Fast iteration on structure before committing to HTML |

## D2 Quick Reference

```bash
# Sketch style with auto dark/light mode
d2 --sketch --theme 0 --dark-theme 200 input.d2 output.svg

# All D2 themes
d2 themes
```

D2 files go in `/tmp/diagrams/` during development, rendered SVGs go to `docs/public/blog/diagrams/` or `docs/public/design/`.

## HTML/CSS Templates

Pick based on what you're showing:

| What you're showing | Template | Key elements |
|---|---|---|
| Terminal zones, scrollback, rendering layers | **Terminal Zone** | Dark terminal with window chrome, faded ghost zones above/below, annotation cards |
| Pipeline / data flow / processing stages | **Pipeline Flow** | Horizontal or vertical connected stages, optional gap/warning markers |
| Before/after or A vs B comparison | **Side-by-Side** | Two panels with shared labels, color-coded differences |
| Architecture layers or component hierarchy | **Layer Stack** | Stacked boxes with dependency arrows, grouped by ownership |
| Multi-backend or matrix (e.g. test × emulator) | **Fan-Out** | One input fanning to multiple outputs with shared result |

## Design System

### Colors (Okabe-Ito palette — colorblind-safe)

Use the Okabe-Ito palette for categorical/zone diagrams. These 8 colors are distinguishable across all common color vision deficiencies:

| Color | Hex | rgba (at 0.45) | Typical use |
|---|---|---|---|
| Orange | `#E69F00` | `rgba(230,159,0,0.45)` | Zone A / warning |
| Sky blue | `#56B4E9` | `rgba(86,180,233,0.45)` | Zone B / active / focus |
| Bluish green | `#009E73` | `rgba(0,158,115,0.45)` | Zone C / app-managed |
| Vermillion | `#D55E00` | `rgba(213,94,0,0.45)` | Danger / terminal-owned |
| Blue | `#0072B2` | `rgba(0,114,178,0.45)` | Zone D / primary |
| Reddish purple | `#CC79A7` | `rgba(204,121,167,0.45)` | Zone E |
| Yellow | `#F0E442` | `rgba(240,228,66,0.45)` | Highlight (low contrast on white — use sparingly) |

**Rules**: Never use color alone to convey meaning (WCAG 2.1). Combine with borders, labels, or patterns. Blue+orange is the safest 2-color combo. Avoid red+green together.

### Typography

```css
/* Terminal content */
font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', 'JetBrains Mono', 'Menlo', 'Consolas', monospace;
font-size: 13px;
line-height: 1.85;

/* Labels and annotations */
font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
/* Title: 12.5px bold, Details: 11px medium, Badges: 10px bold */
```

### Terminal Syntax Colors (Dracula-adjacent)

```css
.prompt  { color: #85d6a0; }  /* green — $ or > */
.cmd     { color: #eff0f3; }  /* bright white — commands */
.comment { color: #6b7585; }  /* gray — output, descriptions */
.success { color: #a5d6a7; }  /* light green — checkmarks */
.keyword { color: #d2a0f0; }  /* purple — export, function */
.func    { color: #79c0ff; }  /* blue — function names */
.string  { color: #f0d080; }  /* yellow — strings, hashes */
.bullet  { color: #6ccad4; }  /* cyan — bullets, > prompts */
.dimmed  { color: #555d6e; }  /* dim — punctuation */
```

### Window Chrome

```css
.dot.close    { background: #ff5f57; border: 1px solid #e0443e; }
.dot.minimize { background: #febc2e; border: 1px solid #dea123; }
.dot.maximize { background: #28c840; border: 1px solid #1aab29; }
```

### Dark Mode

Always include:
```css
@media (prefers-color-scheme: dark) {
  body { background: #1a1a2e; }
  .annotation-card { background: #2a2a3a; }
  .annotation-title { color: #e2e8f0; }
  .annotation-details { color: #94a3b8; }
  /* Update badge colors to dark variants */
}
```

## Building the Diagram

### Step 1: Structure

Write the HTML skeleton first — zones, annotations, arrows. Don't style yet.

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>[Diagram Title]</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #f0f0f3;
    font-family: 'Inter', sans-serif;
    display: flex; align-items: center; justify-content: center;
    min-height: 100vh; padding: 40px 20px;
  }
  .page { width: 920px; position: relative; }
  .diagram { position: relative; width: 920px; display: flex; gap: 0; z-index: 1; }
  /* ... zones, annotations, arrows ... */
</style>
</head>
<body>
<div class="page">
  <div class="diagram">
    <div class="arrows-col"><!-- upward arrows with labels --></div>
    <div class="terminal-col"><!-- zone content --></div>
    <div class="annotations-col"><!-- callout cards --></div>
  </div>
</div>
<script>
function positionElements() { /* JS positioning for annotations + arrows */ }
window.addEventListener('load', positionElements);
window.addEventListener('resize', positionElements);
</script>
</body>
</html>
```

### Step 2: Terminal Content

Use **realistic content from one continuous session** — not placeholder text. All zones should tell one story (e.g., a Claude Code session where earlier exchanges scroll up).

- **Ghost zones** (scrollback): Use the same dark background (`rgba(20,20,32,0.40)`) with reduced text opacity (0.35 for furthest, 0.50 for nearer)
- **Live zone**: Full opacity, window chrome (dots + title), drop shadow, colored border
- **Fade gradient**: Add `::after` pseudo-element on the topmost zone with gradient from opaque to transparent — content "trailing off"

### Step 3: Annotation Cards

Floating white cards with:
- Numbered badge (colored by zone)
- Title (semi-bold, 12.5px)
- Bullet list details (11px, muted color)
- 2px colored border matching zone
- Subtle drop shadow

Position with JS — distribute evenly or center on zones.

### Step 4: Connectors

Lines from zone edges to annotation cards:
- 2px height, colored by zone
- Use JS to compute width: `cardLeft - zoneRight`
- Negative margin to extend left if needed

### Step 5: Transition Arrows

Vertical arrows between zones showing content flow:
- Use CSS arrow tip (border trick) + shaft div
- Vertical text label (writing-mode: vertical-rl, rotated)
- Position with JS centered on zone boundaries

### Step 6: Boundary Labels (design docs only)

For technical docs, add boundary markers:
```html
<div class="boundary-label">← maxHistory boundary</div>
<div class="boundary-label">← screen top</div>
```

## Checklist Before Done

- [ ] Content tells one continuous story across zones
- [ ] Opacity creates clear visual hierarchy (ghost → medium → solid)
- [ ] Annotation cards readable and aligned
- [ ] Connector lines actually reach zone edges (test with different zone widths)
- [ ] Dark mode works (toggle system preference to verify)
- [ ] Arrows visible and labeled
- [ ] No red+green as status indicators (use as ownership colors only)
- [ ] Language is simple — avoid jargon in annotation cards (no "immutable", "re-emit", "persists")
- [ ] Terminal content uses monospace, annotations use Inter
- [ ] Total width ~920px, reasonable height
- [ ] `prefers-reduced-motion` for any animations (blinking cursor)

## Output Location

| Context | Path |
|---|---|
| Blog post diagram | `vendor/silvery/docs/public/blog/diagrams/<name>.html` |
| Design doc diagram | `vendor/silvery/docs/public/design/<name>.html` |
| Standalone/other | Ask user |

For design docs, create a separate copy with implementation-specific details (state names, API references, technical boundaries).

## Embedding

In VitePress markdown:
```html
<iframe src="/blog/diagrams/<name>.html" style="width:100%;height:550px;border:none;border-radius:12px;"></iframe>
```

Or as an image reference (if converted to PNG/SVG):
```markdown
![Description](/blog/diagrams/<name>.svg)
```

## Workflow: Getting to a Good Result

The iteration is where the quality comes from. Don't expect the first version to be publishable.

### Starting Points (pick one)

1. **D2 sketch** — generate a quick D2 diagram to establish structure, then rebuild in HTML
2. **Cowork / Claude Artifacts** — describe the diagram, get an initial HTML, then iterate
3. **From scratch** — write HTML directly using the templates above
4. **From reference** — copy an existing diagram and modify content

### Iteration Checklist

Each round, check:
1. **Content** — does it tell one coherent story? Is it realistic, not placeholder?
2. **Visual hierarchy** — can you tell what's primary/secondary at a glance?
3. **Ownership clarity** — is it obvious who owns/controls each zone?
4. **Spacing** — enough breathing room? Not cramped? Not too loose?
5. **Colors** — colorblind-safe? Ownership not status?
6. **Language** — simple words? No jargon in labels?
7. **Dark mode** — toggle system preference, does it still work?
8. **Connectors** — do lines actually reach their targets?

### Verification

Open the HTML in a browser and screenshot with Playwright:
```bash
bunx playwright screenshot --browser chromium --viewport-size=1200,800 file.html /tmp/diagram-check.png
```

## External Tools

| Tool | What | When to use |
|---|---|---|
| **D2** | Diagram-as-code, sketch theme | Quick architectural diagrams, starting points |
| **freeze** | Terminal screenshots (CLI) | Single terminal mockup captures |
| **Terminal.css** | CSS terminal component library | When building terminal-styled HTML diagrams |
| **Rough.js / svg2roughjs** | Hand-drawn SVG style | Apply sketch aesthetic to any SVG |
| **Figma MCP** | Programmatic Figma design | When you need Figma's design tools (rate-limited) |
| **Cowork** | AI design generation | Initial HTML generation from description |
| **Gemini 3 Pro** | AI image generation | Experiment with visual concepts (best text accuracy) |

## Lessons Learned (from the CC rendering blog post)

These are hard-won insights from creating 6 diagrams over multiple days:

### On tool choice
- **D2 and freeze don't produce blog-ready output.** We tried both extensively. D2 sketch theme is decent but limited. freeze SVGs had width bugs. All were eventually rebuilt as HTML.
- **HTML/CSS gives full control** and is the only approach that consistently produces publishable results. Dark mode, responsive, embeddable, iterable.
- **Cowork/Claude Artifacts are great starting points.** Cowork generated the initial zones diagram HTML — better than what we could write from scratch. But it needed 10+ rounds of manual iteration.
- **Figma MCP is rate-limited** (6 calls/month on Starter). Useful for programmatic design but impractical for iteration.

### On design
- **Side-by-side panels must be same height and bottom-aligned.** Different heights look broken. Use `height: Npx` on the frame and `flex: 1` on the content.
- **Pipeline/comparison diagrams need a grid layout.** Use CSS grid so corresponding phases align vertically. Readers compare down columns, not across rows.
- **Use the same word for the same thing.** If both pipelines have a reconciliation step, call it "Reconcile" in both — not "React" in one and "Reconcile" in the other. Add subtitles to explain differences ("React (default async)" vs "React (custom sync)").
- **Labels should be self-contained.** The diagram must make sense without reading the surrounding text. Add subtitles, annotations, legends.
- **Width matters.** Diagrams should work on narrower screens. 640-700px is better than 920px for most diagrams. Only zone diagrams with annotation cards need the full width.

### On content
- **All zones in a zone diagram must tell one continuous story.** Don't put shell commands in zone 1 and Claude output in zone 3. Everything should be from one session.
- **Use simple words in labels.** "Owned by terminal" not "Immutable to app". "Redraws on resize" not "Re-emittable". No jargon.
- **Terminal content should be realistic.** Real commands, real output. Not "Exchange 1", "Exchange 2".

### On iteration
- **Expect 5-10 rounds.** Structure → content → colors → spacing → alignment → terminology → polish. Each round catches things the previous missed.
- **Screenshot after every change.** Use Playwright headless: `bunx playwright screenshot --browser chromium --viewport-size=900,700 file:///path.html /tmp/check.png`
- **The user will catch things you won't.** Visual design needs human eyes. Iterate with the user, not in isolation.
- **Connector lines are the hardest part.** Lines from annotation cards to zones break when zone widths differ. Test with JS-computed widths or negative margins.

## Anti-Patterns

| Don't | Do Instead |
|---|---|
| Expect the first version to be good | Plan for 5-10 iteration rounds |
| Use D2/Mermaid as final output | Use as starting point, rebuild in HTML |
| Use different names for the same concept | Same phase name in both rows, subtitles for differences |
| Put different content types in each zone | Same content type graduating through zones |
| Use opacity alone for visual hierarchy | Combine opacity + border style + shadow |
| Hardcode pixel positions for annotations | Use JS positioning that adapts to content |
| Skip dark mode | Always include `@media (prefers-color-scheme: dark)` |
| Use jargon in diagram labels | Simple words a non-expert can read in 3 seconds |
| Use red+green for status | Use Okabe-Ito palette for colorblind safety |
| Make side-by-side panels different heights | Fixed height + flex:1 for matched panels |
| Make diagrams too wide (920px) | 640-700px for most diagrams |

## Reference Implementations

| Diagram | Path | Shows |
|---|---|---|
| Three-Zone Scrollback (blog) | `~vault/terminal-scrollback-zones.html` | Terminal zones, annotations, arrows, dark mode |
| Three-Zone Scrollback (design doc) | `docs/public/design/scrollback-zones.html` | Same + boundary labels, state names, footer |
| Buffer Comparison | `docs/public/blog/diagrams/01-buffers.html` | Side-by-side terminals, ghost scrollback above, matched height |
| Pipeline Comparison | `docs/public/blog/diagrams/02-pipelines-compared.html` | CSS grid alignment, inline async gap marker, bracket |
| Termless Fan-out | `docs/public/blog/diagrams/05-termless.html` | Flow with fan-out, mini terminal screen buffer |
| Clear-Redraw Cycle | `docs/public/blog/diagrams/06-clear-reprint.html` | Terminal + numbered step cards, vertically centered |
| Dirty Tracking Grid | `docs/public/blog/diagrams/07-dirty-tracking.html` | Cell grid visualization, summary stats |

## Further Reading

- [Diagrams as Code + AI (Paul Simmering)](https://simmering.dev/blog/diagrams/) — practitioner guide
- [D2 Language](https://d2lang.com/) — best diagram-as-code tool
- [Terminal.css](https://terminalcss.xyz/) — CSS terminal component library
- [Okabe-Ito Palette](https://conceptviz.app/blog/okabe-ito-palette-hex-codes-complete-reference) — colorblind-safe colors
