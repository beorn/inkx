---
mentions:
  - km
id: "@km/inbox/fkv4"
aliases:
  - km-fkv4
  - "@km/_orphan/fkv4"
created_at: 2026-01-15T16:22:26Z
closed_at: 2026-01-15T23:53:23Z
---

# [x] E2E Visual Testing Suite for TUI @km/_orphan #feature #P2

Create an end-to-end visual testing suite for the TUI using visual testing mode (ttyd + Playwright screenshots).

## Requirements

1. **Test both TUI1 (Ink) and TUI2 (OpenTUI)** with a switch to select which to test
2. **For each view mode** (List, Columns, Tabs):
- Moving between columns and cards
- Multi-select (Shift+j/k, A for progressive select)
- Overflow and non-overflow scenarios in both directions
8. **Visual Critique**: For each captured screenshot:
- Check visual content against actual content systematically
- Look for layout defects (misalignment, clipping bugs)
- Verify selection highlighting appears correctly
- Check that content is readable and properly formatted

## Test Matrix

| Test Case           | TUI1 | TUI2 | View Mode | Description                          |
| ------------------- | ---- | ---- | --------- | ------------------------------------ |
| Basic navigation    | ✓    | ✓    | All       | j/k/h/l movement                     |
| Column switching    | ✓    | ✓    | Columns   | l/h at column level                  |
| Multi-select        | ✓    | ✓    | All       | Shift+j/k range select               |
| Overflow horizontal | ✓    | ✓    | Columns   | Content clipping from correct side   |
| Overflow vertical   | ✓    | ✓    | All       | Scroll behavior with 50+ items       |
| Selection highlight | ✓    | ✓    | All       | Cyan bg + black fg per design system |
| Task status icons   | ✓    | ✓    | All       | Checkbox markers display correctly   |

## Implementation

Use the visual testing approach from CLAUDE.md:

```bash
pkill -f ttyd 2>/dev/null || true
ttyd -W -p 7681 bun km view -r /tmp/test-vault @next.md &
sleep 3
HEADLESS=true bun x playwright screenshot --viewport-size=1400,900 http://localhost:7681 /tmp/tui.png
```

The test suite should:

1. Set up a test vault with varied content (short tasks, long tasks, many tasks)
2. Run TUI with specified mode (TUI1 or TUI2)
3. Execute navigation commands via @km/_orphan/sh or key input
4. Capture screenshots at each step
5. Compare screenshots for visual defects using AI analysis

## Acceptance Criteria

- [ ] Test harness supports --tui1 and --tui2 flags
- [ ] Tests cover all 3 view modes
- [ ] Visual regression detection works
- [ ] CI-compatible (headless operation)
- [ ] Reports visual defects with screenshot evidence

