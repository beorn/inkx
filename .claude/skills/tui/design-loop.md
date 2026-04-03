---
description: "Design→Build→QA loop for TUI apps. LLM mockup → pixel-perfect build → aesthetic review → iterate. Auto-activates after creating/modifying TUI views."
argument-hint: <description | screenshot.png>
---

# TUI Design Loop — Design, Build, Review, Iterate

**Keywords**: design, mockup, aesthetic, visual, ANSI, pixel-perfect, iterate, design-review

Create visually impressive TUI apps through an LLM-assisted design loop. The loop replaces relying on human eyes for every iteration — LLMs handle aesthetic judgment at scale; humans do final interactive verification.

## When This Auto-Activates

Proactively suggest this skill when:
- Creating a new example in `examples/`
- Significantly redesigning an existing TUI component/view
- User says "make this look better" or "this looks ugly"
- After `/silverize` finds Tarnished patterns that affect visual quality
- After substantial visual changes to any silvery or km-tui view

## Commands

```
/tui design <description>      # Full loop: mockup → build → QA → iterate
/tui design <screenshot.png>   # QA an existing screenshot, suggest improvements
/tui design --qa               # Just the QA phase (same as /design-review)
/tui design --mockup <desc>    # Just the mockup phase (get ANSI design from LLM)
```

## The Loop

```
  DESIGN ──→ BUILD ──→ QA ──→ ship
    ↑                   │
    └───── ITERATE ─────┘
```

### Phase 1: DESIGN — Get an ANSI mockup from external LLM

LLMs (especially Gemini, GPT) produce good ANSI art designs. Send a brief describing:
- What the app does
- Target terminal size (80x24 minimum, 120x40 ideal)
- Which silvery components to use
- Visual style (dense/spacious, borders/borderless, color palette)

```bash
bun llm --model gemini-2.5-pro -y --no-recover "$(cat <<'PROMPT'
Design a terminal UI mockup in ANSI text art for: <DESCRIPTION>

Requirements:
- Terminal size: 80 columns x 24 rows
- Use Unicode box-drawing characters for borders (╭╮╰╯│─)
- Use semantic color names: $primary (blue), $success (green), $warning (yellow), $error (red), $muted (gray)
- Show realistic content (not lorem ipsum)
- Include a status bar at the bottom
- Design should feel polished and professional

Output ONLY the ANSI text art mockup, no explanation. Mark colors with $token names in comments.
PROMPT
)"
```

**Save the mockup** — it's the design spec that the build phase implements.

### Phase 2: BUILD — Implement pixel-perfect from the mockup

Build the TUI using silvery components to match the mockup exactly:
- Map mockup elements to silvery components (Box, Text, SelectList, ListView, etc.)
- Use semantic `$token` colors (never hardcode)
- Follow The Silvery Way — canonical components, no manual handlers
- Run `/silverize` to verify code quality

### Phase 3: QA — Screenshot and review

Screenshot the running app and get LLM aesthetic feedback:

```bash
# Capture screenshot via TTY MCP
mcp__tty__start(command: ["bun", "<app-path>"])
mcp__tty__screenshot(outputPath: "/tmp/design-qa.png")
mcp__tty__stop()

# Run design review (uses /design-review skill)
/design-review /tmp/design-qa.png
```

The `/design-review` skill sends the screenshot to external LLMs for structured evaluation:
- Tier 1: Claude Read (free, ~40% detection)
- Tier 2: Best cloud model (see benchmark in /design-review) — ~95% detection
- Pixel measurements for alignment/spacing

### Phase 4: ITERATE — Feed feedback back into code

Take the `/design-review` findings and fix each issue:
1. Read the findings (specific locations, suggested fixes)
2. Edit the component code
3. Re-screenshot
4. Re-run `/design-review`
5. Repeat until score >= 8/10

**Stop iterating when**: design review score >= 8/10 AND no P0/P1 findings.

### Phase 5: SHIP — Human approval + golden screenshot

1. User does interactive review (keyboard, mouse, resize)
2. If approved: generate golden screenshot for regression
3. Add to docs/examples if applicable

## Comparison: Design Loop vs Standalone /design-review

| | /tui design | /design-review |
|---|---|---|
| **Scope** | Full loop: mockup → build → QA → iterate | QA only: evaluate a screenshot |
| **When** | Creating or redesigning a TUI | Reviewing any existing screenshot |
| **Output** | Working code + approved screenshot | Findings report + score |
| **Phases** | 5 (design, build, QA, iterate, ship) | 1 (evaluate) |

`/design-review` is a subset — it's Phase 3 of `/tui design`. Use `/design-review` alone when you just need to evaluate what exists. Use `/tui design` when you're building something new.

## Anti-Patterns

| Don't | Do Instead |
|---|---|
| Build UI without a mockup | Get an ANSI mockup first — LLMs are good at this |
| Iterate without screenshots | Screenshot after every change, compare |
| Trust your own aesthetic judgment | Use /design-review for LLM evaluation |
| Ship without human interactive test | Layer 5 is always human |
| Use hardcoded colors in mockup | Use $token names — they map to any theme |
| Skip /silverize | Code quality affects visual quality |
