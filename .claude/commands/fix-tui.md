---
description: Debug and fix TUI rendering issues using visual regression testing
argument-hint: [issue] (describe the visual bug, or "explore" for full check)
allowed-tools: Task, Read, Glob, Grep, Bash, TodoWrite, AskUserQuestion, mcp__peekaboo__image, mcp__peekaboo__see
---

# Fix TUI Visual Rendering Issues

Debug and fix TUI rendering issues through exploratory and regression testing.

**Issue**: $ARGUMENTS

**Uses**: Visual Testing skill (`.claude/skills/visual-test.md`) for capture methodology
**Reference**: [Visual Testing Specs](.claude/docs/visual-testing.md) for verification checklists

## The Fix Loop

```
┌─────────────────────────────────────────────────────────────┐
│                      FIX-TUI LOOP                           │
│                                                             │
│  1. SETUP    → Start TUI with test fixtures                 │
│  2. CAPTURE  → Screenshot the running TUI                   │
│  3. EXPLORE  → Navigate views, check rendering              │
│  4. COMPARE  → Verify against source files                  │
│  5. FIX      → Update rendering code                        │
│  6. REGRESS  → Re-test to confirm fix                       │
│  7. CLEANUP  → Kill processes, remove temp files            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Step 1: Setup Test Environment

```bash
# Kill any existing ttyd
pkill -f ttyd 2>/dev/null || true

# Copy test fixtures to /tmp (avoid modifying repo)
rm -rf /tmp/tui-test-vault
cp -r apps/km-cli/tests/fixtures/tui-test-vault /tmp/tui-test-vault

# Start TUI via ttyd
cd /Users/beorn/Code/pim/km
ttyd -W -p 7681 bun km view -r /tmp/tui-test-vault @next.md &
sleep 3

# Create output directory
mkdir -p /tmp/tui-visual-test
```

## Step 2: Capture Screenshots

Use Playwright for headless capture (preferred):

```bash
bun x playwright screenshot \
  --viewport-size=1400,900 \
  http://localhost:7681 \
  /tmp/tui-visual-test/tui-initial.png
```

Or use Peekaboo MCP tool for interactive sessions:

- `mcp__peekaboo__image` with `app_target: "Safari"` or `"Ghostty"`

Then **read the screenshot** using the Read tool to analyze.

## Step 3: Exploratory Testing

Navigate through the TUI and capture each state. Test coverage:

### Views to Check

| View    | Key | What to Verify                                   |
| ------- | --- | ------------------------------------------------ |
| Columns | `2` | Column borders, headers yellow, tree indentation |
| Cards   | `1` | Card borders, compact mode, selection highlight  |
| Tabs    | `3` | Tab bar, active tab indicator                    |
| List    | `4` | Full-width, section headers                      |

### States to Check

| State         | How to Trigger          | What to Verify                |
| ------------- | ----------------------- | ----------------------------- |
| Selection     | Arrow keys              | Blue background on selected   |
| Multi-select  | `v` then arrows         | Cyan background on multi      |
| Folded        | `z`                     | ▶ indicator, children hidden  |
| Expanded      | `z` again               | ▼ indicator, children visible |
| Done tasks    | Navigate to Done column | Strikethrough + dim           |
| Dropped tasks | Navigate to Dropped     | Strikethrough + dim           |
| Blocked tasks | Find `[!]` marker       | ⊘ icon, red color             |
| WIP tasks     | Find `[/]` marker       | ◐ icon, yellow color          |

### Content to Check

| Content       | Source Example               | Expected Rendering        |
| ------------- | ---------------------------- | ------------------------- |
| Wiki links    | `[[Projects/API\|API docs]]` | Dim underlined "API docs" |
| Inline fields | `[priority:: 1]`             | Hidden (stripped)         |
| Bold          | `**bold**`                   | Bold text                 |
| Italic        | `*italic*`                   | Italic text               |
| Code          | `` `code` ``                 | Cyan monospace            |
| Strike        | `~~strike~~`                 | Strikethrough             |

## Step 4: Compare Against Source

Read the source files to verify content matches:

```bash
cat /tmp/tui-test-vault/@next.md
cat /tmp/tui-test-vault/Inbox.md
cat /tmp/tui-test-vault/Projects/*.md
```

Key verification points:

- Task count in columns matches file content
- Text content matches (minus inline fields)
- Hierarchy/nesting preserved
- Status markers → correct icons

## Step 5: Diagnose and Fix

### Quick Diagnostic

If issue appears in `bun storybook` → Rendering code bug (Layers 1-3)
If issue only in full TUI → Environment/terminal/Ink bug

### Layer Mapping

| Symptom                       | Layer | Files to Check                  |
| ----------------------------- | ----- | ------------------------------- |
| Text not styled (bold/italic) | 1     | `src/text/rich.ts`              |
| Wiki links not dim/underlined | 1     | `src/text/rich.ts`              |
| Inline fields visible         | 1     | `src/text/rich.ts`              |
| Wrong status icon             | 1     | `src/text/icons.ts`             |
| Wrong icon color              | 1     | `src/text/icons.ts`             |
| Text overlap                  | 2     | `src/tui/layout/truncate.ts`    |
| Text not truncated            | 2     | `src/tui/layout/truncate.ts`    |
| Bad wrapping                  | 2     | `src/tui/layout/wrap.ts`        |
| Path rendering wrong          | 2     | `src/tui/layout/path.ts`        |
| Selection not visible         | 3     | `src/tui/views/TreeNode.tsx`    |
| Done not strikethrough        | 3     | `src/tui/views/TreeNode.tsx`    |
| View layout broken            | 3     | `src/tui/views/*.tsx`           |
| Column borders wrong          | 3     | `src/tui/views/ColumnsView.tsx` |

### Common Fixes

**Text overlap**: Check `displayLength()` handles ANSI codes correctly
**Truncation wrong**: Check `truncateText()` uses display length not string length
**Icon wrong**: Check status string mapping in `getStatusIcon()`
**Strikethrough missing**: Check `isDoneOrDropped` logic in TreeNode

## Step 6: Regression Testing

After fixing, verify the fix AND check for regressions:

```bash
# Run unit tests
bun test

# Run lint/format
bun fix

# Quick visual check via storybook
bun storybook

# Full regression - restart TUI and re-capture
pkill -f ttyd 2>/dev/null || true
ttyd -W -p 7681 bun km view -r /tmp/tui-test-vault @next.md &
sleep 3
bun x playwright screenshot \
  --viewport-size=1400,900 \
  http://localhost:7681 \
  /tmp/tui-visual-test/tui-after-fix.png
```

Compare before/after screenshots. Verify:

- [ ] Original issue fixed
- [ ] No new visual regressions
- [ ] All view modes still work
- [ ] Selection/navigation still works

## Step 7: Cleanup

```bash
pkill -f ttyd 2>/dev/null || true
rm -rf /tmp/tui-test-vault
rm -rf /tmp/tui-visual-test
```

## Quick Storybook Verification

For isolated component testing without full TUI:

```bash
bun storybook
```

This renders all layers through ink-testing-library. Useful for:

- Checking specific component rendering
- Faster iteration when debugging Layer 1-2 issues
- Verifying rich text and icon rendering in isolation

To capture storybook output:

```bash
pkill -f ttyd 2>/dev/null || true
ttyd -W -p 7681 bash -c 'bun storybook; sleep 120' &
sleep 5
bun x playwright screenshot \
  --viewport-size=1600,2400 \
  --full-page \
  http://localhost:7681 \
  /tmp/tui-visual-test/storybook.png
```

## Troubleshooting

### Port 7681 in use

```bash
pkill -f ttyd
lsof -i :7681
```

### No content showing

- Check terminal width (TUI needs ~80+ cols)
- Run `bun storybook` to verify rendering code works
- Check ttyd stderr for errors

### Text overlap

- Check `displayLength()` ANSI handling in `src/tui/layout/truncate.ts`
- Verify `padText()` uses display length

### Playwright not found

```bash
bun x playwright install chromium
```

### Colors not showing

- Ensure `chalk.level = 3` is set
- Check terminal supports 256 colors

## Commit Checklist

Before committing a fix:

- [ ] `bun test` passes (all 350+ tests)
- [ ] `bun fix` passes (lint + format)
- [ ] `bun storybook` shows correct rendering
- [ ] Full TUI tested with test fixtures
- [ ] Added unit test reproducing the bug
- [ ] Before/after screenshots compared
