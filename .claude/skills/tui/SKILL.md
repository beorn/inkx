---
description: TUI development - design system, km-specific rendering bugs, performance. Use when building silvery components for km, fixing km-tui visual bugs, or optimizing TUI performance. For silvery pipeline bugs (dirty flags, incremental rendering, scroll tiers), use /silvery instead.
argument-hint: [fix|design|perf]
allowed-tools: Task, Read, Glob, Grep, Bash
benefits-from: [recall, tests]
escalate-to: {render: "silvery pipeline bug, not km component issue", arch: "new component pattern or state management design", npm: "silvery package exports or API surface"}
---

# TUI Development

**Keywords**: TUI, silvery, styling, colors, slow, rendering, performance, design system, km-tui, board, card, column

Build and maintain the km TUI. For silvery rendering pipeline issues (incremental rendering, dirty flags, scroll tiers, sticky children), use `/silvery` instead.

## Quick Reference

| Need                        | Load                                          |
| --------------------------- | --------------------------------------------- |
| **User reports a bug**      | [fix.md](fix.md) (see for important TUI info) |
| **Rendering bug** (ghost chars, stale pixels) | [fix.md](fix.md) → "Rendering Bugs" section |
| Colors, icons, styling      | [design.md](design.md)                        |
| **Design a new TUI / redesign** | [design-loop.md](design-loop.md) — LLM mockup → build → QA → iterate |
| **Review visual quality**   | [Visual Design Review](#visual-design-review) below |
| **Silvery Way code audit**  | `/silverize` (separate skill)                 |
| Slow rendering, memoization | [optimization.md](optimization.md)            |

## Auto-Activation

**Proactively activate** these skills without being asked:

| After doing this... | Suggest... |
|---|---|
| Creating/modifying files in `examples/` | `/silverize` + `/tui review` |
| Modifying view components (`*View.tsx`, `*Column.tsx`, `*Node.tsx`) | `/tui review` on a screenshot |
| Creating a new TUI component or example | `/tui design` (full design loop) |
| Completing substantial visual changes | `/tui review --quick` at minimum |
| User says "looks ugly", "make it look better", "fix the design" | `/tui design` |

## Critical Design Rules

- Selection: `cyan` bg + `black` fg (NEVER blue)
- `inverse` reserved for input cursor only
- Icons: color AND shape (colorblind-safe)
- No emojis in status indicators

## Ink Gotchas

1. **Fullscreen race**: Add 50ms delay after clear
2. **Width calculation**: Manual for ANSI, use `stringWidth()`
3. **Text truncation**: Must be ANSI-aware

## Common Debug Commands

See [tests/SKILL.md](../tests/SKILL.md) for test commands.

```bash
# FIRST: Run with diagnostic mode (catches incremental render bugs)
SILVERY_STRICT=1 bun vitest run apps/km-tui/tests/
SILVERY_STRICT=1 bun km view /path/to/vault

# Run visual storybook (inline default, j/k to navigate, q to quit)
bun storybook
bun storybook --fullscreen       # alternate screen
bun storybook --fullscreen-nonalt
```

**Full design rationale**: [docs/ref/ui.md](../../docs/ref/ui.md)

---

## Visual Design Review

AI-powered visual design review -- screenshots, pixel measurements, heuristic analysis. Combines TTY text verification, AI visual analysis, programmatic pixel measurement, and design heuristic evaluation.

### Resolution Rule

**Always review at 2x resolution.** Standard-res thumbnails miss most issues. Experimentally verified: 2x (2200x1400) finds 5.6x more issues than standard (1100x700).

### Usage

```
/tui review <path.png>              # Full pipeline: TTY scan -> Claude Read -> cloud review
/tui review --quick <path.png>      # Quick: Claude Read of 2x only (free)
/tui review --tty <demo-command>    # TTY text overflow scan only (free, instant)
```

### Review Tiers (benchmarked 2026-04-03)

| Tier | What | Speed | Cost | Best For |
|------|------|-------|------|----------|
| **Tier 0: TTY text scan** | Scan for overflow past border chars | ~5s | Free | Quick smoke |
| **Tier 1: Claude Read (2x)** | Read 2x PNG with built-in vision | Instant | Free | Daily work |
| **Tier 2: O3 (2x)** | Send 2x PNG to O3 | ~27s | ~$0.014 | Best value |
| **Tier 3: Gemini 3 Pro (2x)** | Harshest critic | ~41s | ~$0.021 | "Is this ready?" gate |
| **Tier 4: GPT 5.4 Pro (2x)** | Most detailed | ~295s | ~$1.46 | Showcase-critical |

### Design Intent (assess before measuring)

Before pixel-counting, establish: What is this? Target audience? Primary goal? Desired feeling? Then check: Does a first-time viewer understand in 3 seconds? Is the primary action obvious? Would someone share this?

### Measurement Script

Use Python + Pillow + numpy to measure margins, detect background color, compute content bounding box, score symmetry. Thresholds: horizontal symmetry < 2% good, 2-5% flag, > 5% block. Fill 40-85% good.

### Exhaustive Checklist (47 items)

**Layout & Spacing** (9): margin symmetry, edge margins, inner padding, section gaps, fill ratio, whitespace balance, alignment grid, baseline alignment, centering.

**Typography & Text** (8): heading hierarchy, text weight, dim/muted, truncation, wrapping, label alignment, number alignment, monospace consistency.

**Borders & Containers** (5): style consistency, completeness, overlap, color, nesting.

**Color & Contrast** (6): semantic usage, consistency, text contrast, background contrast, color count, colorblind safety.

**Rendering Defects** (7): overflow, clipping, artifacts, wide chars, fill patterns, cursor artifacts, scroll indicators.

**Interaction Indicators** (4): selection highlight, focus indication, active tab, disabled state.

**Higher-Level Design** (8): first impression, emotional response, content quality, information density, visual rhythm, showcase effectiveness, competitive quality, Twitter test.

For each check, verdict is BLOCK (looks broken), FLAG (noticeable), or OK (passes).

### Terminal UI Design Principles

- 1-2 char padding inside borders, 1 empty line between sections
- **Bold** for headings, normal for body, **dim** for secondary
- Semantic tokens only: `$primary`, `$success`, `$error`, `$warning`, `$muted`
- `cyan` bg reserved for selection, `inverse` reserved for input cursor
- Borders consistent style throughout, truncation with ellipsis
- Focus indicators immediately obvious

### Design-First Demo Workflow

Use [design-loop.md](design-loop.md) when building or redesigning showcase demos. Design at ASCII text level first (LLM mockup -> build -> QA -> iterate).

### Quick Commands

```bash
# O3 review (best value -- $0.02)
bun llm --model o3 --image /path/to/screenshot-2x.png -y "Review this terminal UI for visual bugs..."

# GPT-5.4 review (second opinion -- $0.04)
bun llm --image /path/to/screenshot-2x.png -y "Review this terminal UI for visual bugs..."

# Local 32B review (free, ~85s)
bun llm --model ollama:qwen2.5vl:32b --image /path/to/screenshot-2x.png -y "List every visual bug..."
```

### See Also

- [design-loop.md](design-loop.md) -- design-first screenshot creation workflow
- [design.md](design.md) -- km TUI design system (colors, selection, icons)
- [The Silvery Way](../../../vendor/silvery/docs/guide/the-silvery-way.md) -- canonical component patterns
- [Silvery Styling](../../../vendor/silvery/docs/guide/styling.md) -- semantic theme tokens
