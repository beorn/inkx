---
description: Debug and fix TUI rendering issues using visual regression testing
argument-hint: [issue] (describe the visual bug, or "explore" for full check)
allowed-tools: Task, Read, Glob, Grep, Bash, TodoWrite, AskUserQuestion
---

# Fix TUI Visual Rendering Issues

Debug and fix TUI rendering issues through exploratory and regression testing.

**Issue**: $ARGUMENTS

**Reference**: `.claude/skills/visual-test.md` for capture methods, specs, and checklists

## CRITICAL: Use Headless Testing Only

**ALWAYS use headless methods (Storybook + Playwright/ttyd).** DO NOT use Peekaboo/desktop capture unless the user explicitly asks.

## The Fix Loop

```
1. SETUP    → Prepare test data, start TUI via ttyd
2. CAPTURE  → Screenshot with Playwright
3. DIAGNOSE → Compare against specs in visual-test.md
4. FIX      → Update rendering code
5. VERIFY   → Re-capture, run tests
6. CLEANUP  → Kill ttyd, remove temp files
```

## Quick Start

```bash
# 1. Setup
pkill -f ttyd 2>/dev/null || true
rm -rf /tmp/tui-test-vault
cp -r apps/km-cli/tests/fixtures/tui-test-vault /tmp/tui-test-vault

# 2. Start TUI (use flags: -r for vault, --view for mode)
ttyd -W -p 7681 bun km view -r /tmp/tui-test-vault @next.md &
sleep 3

# 3. Capture (prefer 800,600 or 1000,700 - faster + tests overflow)
HEADLESS=true bun x playwright screenshot --viewport-size=1000,700 http://localhost:7681 /tmp/tui.png

# 4. View screenshot
# Use Read tool on /tmp/tui.png
```

For OpenTUI, add environment variables:

```bash
COLORTERM=truecolor OTUI_USE_ALTERNATE_SCREEN=false ttyd -W -p 7681 bun km view ...
```

## Diagnosis

**Quick check**: If `bun storybook` shows the bug → rendering code issue (Layers 1-3).
If only full TUI shows bug → environment/terminal/Ink issue.

See `.claude/skills/visual-test.md` for:

- Architecture layers and file mapping
- Rendering specifications (icons, colors, states)
- Verification checklist
- Bug diagnosis table

## Verification

After fixing:

```bash
bun run test:fast  # Quick tests (~4s)
bun fix            # Lint + format
bun storybook      # Visual check

# Re-capture and compare
pkill -f ttyd; ttyd -W -p 7681 bun km view -r /tmp/tui-test-vault @next.md &
sleep 3
HEADLESS=true bun x playwright screenshot --viewport-size=1000,700 http://localhost:7681 /tmp/tui-after.png
```

## Cleanup

```bash
pkill -f ttyd 2>/dev/null || true
rm -rf /tmp/tui-test-vault /tmp/tui-visual-test
```

## Commit Checklist

- [ ] `bun run test:all` passes
- [ ] `bun fix` passes
- [ ] Visual verification complete
- [ ] Added unit test for the bug
