---
description: Debug and fix TUI rendering issues using visual regression testing with Playwright
---

# Fix TUI Visual Rendering Issues

Systematically inspect and fix TUI rendering issues using visual testing.

## The Fix Loop

This command implements an iterative verification loop:

```
┌─────────────────────────────────────────────────────────┐
│                    FIX-TUI LOOP                         │
│                                                         │
│  1. CAPTURE → Take screenshots of TUI                   │
│  2. ANALYZE → Read screenshots, identify issues         │
│  3. COMPARE → Check against source files on disk        │
│  4. VERIFY  → Match against rendering specs             │
│  5. FIX     → Update rendering code                     │
│  6. REPEAT  → Until all issues resolved                 │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Step 1: Setup Test Environment

```bash
# Kill any existing ttyd
pkill -f ttyd 2>/dev/null || true

# Use test fixtures (copy to /tmp to avoid modifying repo)
rm -rf /tmp/tui-test-vault
cp -r apps/km-cli/tests/fixtures/tui-test-vault /tmp/tui-test-vault

# Start ttyd server
cd /Users/beorn/Code/pim/km
ttyd -W -p 7681 bun km view -r /tmp/tui-test-vault @next.md &
sleep 3

# Create output directory
mkdir -p /tmp/tui-visual-test
```

## Step 2: Capture Screenshots

Use Peekaboo to capture the TUI in Ghostty or other terminal:

```bash
# If running in a visible terminal (Ghostty)
peekaboo image --app "Ghostty" --path /tmp/tui-visual-test/capture.png

# Or use the Playwright script for headless testing
bun run /tmp/capture-tui.ts
```

## Step 3: Analyze Screenshots

After capturing, read the screenshots to identify rendering issues:

1. Use the Read tool to view `/tmp/tui-visual-test/*.png`
2. Check for common issues (see checklist below)
3. Document each issue found

## Step 4: Compare Against Source Files

For each item visible in the TUI, verify it matches the source:

```bash
# Source files in test vault
cat /tmp/tui-test-vault/@next.md
cat /tmp/tui-test-vault/Inbox.md
cat /tmp/tui-test-vault/Projects/*.md
```

**Verification checklist:**

- [ ] Task content matches source markdown
- [ ] Parent context (for embedded tasks) shows correct source file
- [ ] Status icons match checkbox marks in source: `[ ]`→○, `[x]`→✓, `[/]`→◐, `[!]`→⊘, `[-]`→∅
- [ ] Wiki links `[[...]]` render as dim underlined text (link stripped)
- [ ] Inline fields `[field:: value]` are stripped from display
- [ ] Rich formatting preserved: **bold**, _italic_, `code`, ~~strikethrough~~

## Step 5: Verify Against Rendering Specs

Check rendering behavior against specs:

### Expected Rendering Behavior

From [apps/km-cli/src/tui/README.md](apps/km-cli/src/tui/README.md):

1. **Layered Rendering Pipeline:**
   - `renderRich()` → converts raw content to styled ANSI string
   - `constrainText()` → wraps and truncates using display length
   - React components → render each line in `<Text>`

2. **Status Icons** (from [render-icons.ts](apps/km-cli/src/tui/render-icons.ts)):
   | Status | Icon | Color |
   |--------|------|-------|
   | open/todo | ○ | gray |
   | done | ✓ | green |
   | in_progress | ◐ | yellow |
   | blocked | ⊘ | red |
   | waiting | ◷ | blue |
   | dropped | ∅ | gray |

3. **Type Icons:**
   | Type | Icon |
   |------|------|
   | folder | 📁 |
   | file | 📄 |
   | section | # |
   | paragraph | (empty) |
   | code | ` |
   | quote | " |
   | list item | · |

4. **Parent Context:**
   - For embedded (symlinked) tasks at depth 0-1
   - Shown as dimmed text: `< parent-file`
   - In compact mode: shown on separate line
   - In wide mode: inline if single-line content

5. **Line Padding:**
   - All lines padded to full width to prevent overlap on re-render
   - Uses `displayLength()` to measure styled text width

## Step 6: Fix Issues

Key files to modify:

- [render-text.ts](apps/km-cli/src/tui/render-text.ts) - Text rendering, rich formatting
- [render-icons.ts](apps/km-cli/src/tui/render-icons.ts) - Status/type icons
- [TreeNode.tsx](apps/km-cli/src/tui/views/TreeNode.tsx) - Node rendering component
- [ListView.tsx](apps/km-cli/src/tui/views/ListView.tsx) - List view
- [ColumnsView.tsx](apps/km-cli/src/tui/views/ColumnsView.tsx) - Columns view
- [Board.tsx](apps/km-cli/src/tui/views/Board.tsx) - Main board component

## Step 7: Verify Fix and Repeat

```bash
# Run tests
bun test

# Run lint/format
bun fix

# Re-capture screenshots
pkill -f ttyd || true
ttyd -W -p 7681 bun km view -r /tmp/tui-test-vault @next.md &
sleep 3
# Capture again and verify fix
```

## Issues Checklist

### Text Rendering

- [ ] No text concatenation/overlap between items
- [ ] Wiki links `[[link]]` rendered correctly (dim, underlined)
- [ ] Inline fields stripped `[field:: value]` not shown
- [ ] Long text truncated with ellipsis `…`
- [ ] Multi-line content wraps properly
- [ ] Rich text: **bold**, _italic_, `code`, ~~strikethrough~~
- [ ] Parent context shows correct source for embedded tasks

### Layout

- [ ] Proper spacing between items
- [ ] Column borders aligned
- [ ] Selection highlighting visible (blue background)
- [ ] Status bar shows correct view mode
- [ ] No text overflow or clipping
- [ ] Lines padded to prevent overlap on re-render

### Icons

- [ ] Task status icons colored correctly
- [ ] Fold indicators: `▶` (folded), `▼` (expanded)
- [ ] Type icons display properly

### Colors

- [ ] Column headers yellow
- [ ] Selected item blue background
- [ ] Dimmed text for context/metadata
- [ ] Status icon colors: green=done, yellow=wip, red=blocked, blue=waiting

## Bug Handling Guidelines

### Upstream Package Bugs

If you discover a bug in an upstream package (ink, ttyd, Playwright, etc.):

1. **Create a bead** documenting the bug with:
   - Package name and version
   - Minimal reproducible example
   - Expected vs actual behavior
   - Potential workaround (if any)

2. **Example bead creation:**

   ```bash
   bd create --title="ink: Text overflow on ANSI sequences" \
     --type=bug --priority=3 \
     --description="ink's Text component miscalculates width when..."
   ```

3. The reproducible example can be used to submit patches upstream

### Adding Unit Tests for Bugs

When you find a rendering bug:

1. **Add a unit test** that reproduces the bug before fixing
2. Test should fail initially, then pass after the fix
3. Test files:
   - `apps/km-cli/tests/render-text.test.ts` - text rendering
   - `apps/km-cli/tests/render-icons.test.ts` - icon rendering
   - `apps/km-cli/tests/board.test.ts` - board/TUI behavior

4. **Example test:**
   ```ts
   test("wiki links with special chars render correctly", () => {
     const result = renderPlain("Check [[Projects/API|API docs]]");
     expect(result).toBe("Check API docs");
   });
   ```

## Cleanup

```bash
pkill -f ttyd 2>/dev/null || true
rm -rf /tmp/tui-test-vault
rm -rf /tmp/tui-visual-test
```

## Troubleshooting

### Port 7681 in use

```bash
pkill -f ttyd
lsof -i :7681
```

### No content showing in cards

- Check if content is being truncated due to insufficient width
- Verify parent context isn't taking all available space
- Run debug script: `bun run apps/km-cli/tests/tui-debug.ts`

### Text overlap

- Check line padding in TreeNode.tsx
- Verify `displayLength()` is calculating ANSI-aware width
- Ensure all lines are padded to full width
