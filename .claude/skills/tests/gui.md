---
description: GUI testing with ttyd+playwright - pixel-level screenshot verification
---

# GUI Tests (ttyd + Playwright)

Pixel-level screenshot verification for regression testing.

**Keywords**: GUI test, pixel-level, screenshot, ttyd, playwright, visual

---

## When to Use

- Verify exact pixel rendering
- Check fonts, colors, alignment
- Pixel-level regression detection

---

## File Pattern

- `*.slow.spec.ts` (always slow - involves browser automation)

---

## Setup

```bash
# 1. Prepare test data
rm -rf /tmp/test-repo && mkdir -p /tmp/test-repo
echo -e "# Test\n- [ ] Task 1\n- [x] Task 2" > /tmp/test-repo/test.md

# 2. Get free port
TTYD_PORT=$((7700 + RANDOM % 300))
while lsof -i :$TTYD_PORT >/dev/null 2>&1; do TTYD_PORT=$((7700 + RANDOM % 300)); done

# 3. Start TUI
ttyd -W -p $TTYD_PORT bun km view -r /tmp/test-repo test.md &
sleep 3

# 4. Capture
HEADLESS=true bun x playwright screenshot --viewport-size=1000,700 http://localhost:$TTYD_PORT /tmp/tui.png

# 5. Cleanup
pkill -f ttyd
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Blank screenshot | Increase sleep (3→5→10) |
| Port in use | Use dynamic port allocation |
| Playwright missing | `bun x playwright install chromium` |
| ttyd missing | `brew install ttyd` |

---

## CLI Debugging Alternative

For quick capture without browser automation:

```bash
km screenshot /path/to/repo --width 80 --height 24
km screenshot /path/to/file.md --format ansi -o /tmp/out.txt
```

---

## When to Use What

| Need | Use |
|------|-----|
| Automated TUI tests | [TUI tests (inkx)](tui.md) |
| Pixel-level verification | GUI tests (this) |
| Debug visual issue | ttyd + Playwright (manual) |
| Share TUI state in bug report | km screenshot |

---

## Note

Currently manual. If automated, use `.slow.spec.ts` suffix since these tests involve browser automation and are inherently slow.
