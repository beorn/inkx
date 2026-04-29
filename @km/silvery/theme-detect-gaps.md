---
id: "@km/silvery/theme-detect-gaps"
aliases:
  - km-silvery.theme-detect-gaps
  - km-silvery-theme-detect-gaps
created_by: Bjørn Stabell
created_at: 2026-04-18T05:07:25Z
closed_at: 2026-04-18T05:43:06Z
close_reason: Merged into km-silvery.scheme-detect (unified detection bead)
---

# [x] Theme detection gaps — probe OSC 12/17/19, strengthen selection fallback @km/silvery #bug #P3

blocks:: [[@km/silvery/design-system]]

## Why

Silvery's current @silvery/ansi/theme/detect.ts probes only OSC 10 (fg), OSC 11 (bg), and OSC 4 (16 ANSI). It has weak hardcoded fallbacks for the 4 remaining semantic slots:

```ts
palette.cursorColor         = fg                // ❌ wrong ~76% of the time (analysis of 25 palettes)
palette.cursorText          = bg                // ✅ universal (25/25)
palette.selectionForeground = fg                // ⚠️ right 76% of the time
palette.selectionBackground = ansi[4]  // blue  // ❌ no palette matches this
```

terminfo.dev support data shows these probes are more reliable than assumed:

| OSC | Slot | Real-terminal support |
|---|---|---|
| OSC 12 | cursorColor | 86% (6/7 tested) |
| OSC 17 | selectionBackground | 43% (3/7) |
| OSC 19 | selectionForeground | 43% (3/7) |

OSC 12 is the clear win — high support, silvery isn't probing it. OSC 17/19 are best-effort but free with DA1 sentinel timeouts.

## Changes

### 1. Add OSC 12 probing
High support (86%), simple parallel probe alongside OSC 10/11. Populates cursorColor reliably on modern terminals.

### 2. Add OSC 17/19 probing (best-effort)
Use DA1 sentinel pattern — fast-fails on unsupported terminals, no wait-for-timeout. 43% success is worth having.

### 3. Skip probing cursorText
cursorText = background is 100% universal (25/25 palettes). No OSC needed, don't probe.

### 4. Strengthen selectionBackground fallback
Remove `= ansi[4]` (no palette matches this). Replace with:
- Primary: fingerprint match against catalog (@km/silvery/theme-auto-detect)
- Fallback: `blend(bg, fg, 0.20)` — coherent, generic, looks intentional

### 5. Strengthen cursorColor fallback
- Primary: fingerprint match against catalog
- Fallback: `= foreground` (only 24% exact, but visually safe)

## Acceptance criteria

- [ ] detectTerminalPalette() probes OSC 12 in addition to existing OSC 10/11/4
- [ ] detectTerminalPalette() probes OSC 17/19 best-effort with DA1 sentinel
- [ ] cursorText is derived (= background), not probed
- [ ] selectionBackground fallback is blend(bg, fg, 0.20), not ansi[4]
- [ ] Fingerprint match integration (wired via @km/silvery/theme-auto-detect)
- [ ] Existing tests still pass
- [ ] New tests: verify each OSC probe path + fallback path

## Related

- Parent: @km/silvery/design-system
- Companion: @km/silvery/theme-auto-detect (fingerprint matching)
- Code: vendor/silvery/packages/ansi/src/theme/detect.ts
- Reference: docs/ref/terminal-color-strategy.md
