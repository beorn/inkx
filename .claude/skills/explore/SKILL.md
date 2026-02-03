---
description: TUI exploration - targeted scenario testing + randomized bug hunting. Use when exercising km view to find bugs, test scenarios, or inspect the live terminal.
argument-hint: [scenario | 100 | --gui | --peekaboo | --seed <n> | --path <vault>]
---

# TUI Exploration Testing

**Keywords**: explore, fuzz, random, bug hunting, TUI test, visual test, repro, peekaboo, ghostty

Exercises `km view` to discover bugs and performance issues. Supports:
- **Targeted exploration**: User describes a scenario, we test it + variations
- **Randomized testing**: Weighted random actions to find edge cases
- **Live terminal inspection**: Use Peekaboo to investigate your running Ghostty terminal

## Quick Reference

| Argument | Description |
|----------|-------------|
| `<N>` | Number of iterations (default: 100) |
| `--gui` | Visual mode via ttyd/Playwright (pixel-level) |
| `--peekaboo` | Inspect live Ghostty terminal via Peekaboo MCP |
| `--seed <n>` | Fixed seed for reproducibility |
| `--path <vault>` | Use existing vault instead of generated data |

**Examples:**
```
/explore 50              # Quick 50-iteration headless run
/explore --seed 12345    # Reproducible run
/explore --gui           # Visual mode with screenshots
/explore --path /tmp/tst-vault-linking  # Test existing vault
/explore --peekaboo      # Inspect your live Ghostty terminal

# Targeted exploration (describe the scenario)
/explore going down after "Justice" node causes cursor to jump
/explore switching from cards to list view loses cursor position
/explore zoom into Projects folder then press j

# Live investigation with Peekaboo
/explore --peekaboo check why the cursor is misaligned
/explore --peekaboo investigate the rendering glitch in cards view
```

## Default Workflow (TUI Mode)

**Run the exploration script:**

```bash
# Quick run (random seed)
bun scripts/explore-tui.ts --iterations 100

# Reproducible run
bun scripts/explore-tui.ts --iterations 100 --seed 12345

# Quiet mode for CI
bun scripts/explore-tui.ts --iterations 100 --quiet

# JSON output for processing
bun scripts/explore-tui.ts --iterations 100 --json

# With real vault
bun scripts/explore-tui.ts --path /path/to/vault
```

**What it verifies (both DOM and buffer):**

| Check | What | Issue Type |
|-------|------|------------|
| Cursor count | Exactly 1 `[data-cursor]` | `multiple-cursors`, `missing-cursor` |
| Required elements | `#board`, `#bottom-bar` exist | `missing-board`, `missing-bottom-bar` |
| Buffer content | No `[object Object]`, no errors | `object-object`, `error-in-buffer` |
| View mode | Indicator present, `v` cycles mode | `missing-view-mode`, `view-mode-unchanged` |

**When bugs are found:**
1. Script outputs reproduce command with seed
2. Create bead: `bd create "TUI: [description]" --type=bug`
3. Add test to `apps/km-tui/tests/` with `.skip` if not fixing now
4. Reference bead in test comment (e.g., "See bead km-xyz")

## Modes

| Mode | Speed | Use Case |
|------|-------|----------|
| **TUI (default, PREFERRED)** | Fast (~1000/s) | Rapid iteration, DOM-level checks |
| **GUI (`--gui`)** | Slower (~1/s) | Pixel verification, visual bugs |
| **Peekaboo (`--peekaboo`)** | Interactive | Inspect live Ghostty terminal |
| **Targeted** | Varies | User-described scenario first, then expand |

**IMPORTANT: Always prefer TUI mode** (headless `testEnv()`/`board.press()`/`board.screenshot()`) over GUI/TTY mode. TUI tests are faster, more reliable, and catch character-level issues. Only use `--gui` (TTY/Playwright) when pixel-level visual verification is explicitly needed. **If you must use TTY tools, always set timeout to 10000ms (10s)** to avoid hanging on unresponsive sessions.

## Sub-Skills

| File | Purpose |
|------|---------|
| [targeted.md](targeted.md) | User-described scenarios, vault verification |
| [random.md](random.md) | Setup, exploration loop, action weights, verification |
| [reporting.md](reporting.md) | Reports, issue templates, action workflow |
| [peekaboo.md](peekaboo.md) | Live Ghostty terminal inspection via Peekaboo MCP |
| [repro.md](repro.md) | Reproducing unreproducible bugs, debug logging |
