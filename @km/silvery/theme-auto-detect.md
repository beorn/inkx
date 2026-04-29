---
id: "@km/silvery/theme-auto-detect"
aliases:
  - km-silvery.theme-auto-detect
  - km-silvery-theme-auto-detect
created_by: Bjørn Stabell
created_at: 2026-04-18T04:47:48Z
closed_at: 2026-04-18T18:27:37Z
close_reason: Shipped in v0.18.0 — see
  hub/silvery/design/v10-terminal/theme-system-v2-plan.md and silvery v0.18.0
  changelog
---

# [x] Theme auto-detect — probe + fingerprint + derive, with confidence metadata @km/silvery #feature #P3

blocks:: [[@km/silvery/design-system]]

Unify detection into one detectScheme() covering tier + slots + fingerprint + override.

## What

Today silvery has ad-hoc detection in detect.ts. Consolidate into:

1. **Tier detection** — truecolor / 256 / ANSI16 / monochrome / plain. Order: SILVERY_COLOR → --color-tier → NO_COLOR → TERM=dumb → !isatty → COLORTERM → TERM suffix → Windows Terminal → fallback.
2. **Slot probing** — OSC 10/11 (fg/bg, 100%), OSC 4×16 (71%), OSC 12 (cursor, 86%), OSC 17/19 (selection, 43% — best-effort with DA1 sentinel). cursorText derived as = bg (universal).
3. **Fingerprint matching** — hash probed 18 slots (fg+bg+ansi), lookup in catalog. Exact + CIEDE2000 fuzzy (ΔE sum <30). Returns { scheme, confidence }.
4. **Tier strategy** — A: full probe / B: probe + fingerprint / C: probe + formulas / D: declared fallback.
5. **Forced override** — SILVERY_COLOR env var: truecolor/256/ansi16/scheme/mono/auto.

Strengthens today's weak hardcode (selectionBackground = ansi[4] blue).

## Acceptance

- [ ] detectCapability() returns { tier, source, overrides }
- [ ] detectScheme({ timeout }) returns 22 slots regardless of tier
- [ ] Probes OSC 12 (new) + OSC 17/19 (best-effort)
- [ ] Skips cursorText probe (= bg always)
- [ ] Fingerprint exact + fuzzy match
- [ ] SILVERY_COLOR forces tier
- [ ] Safe in SSH/tmux/CI/piped — no hangs
- [ ] Unit tests per env-var combo

Full context: hub/silvery/design/v10-terminal/terminal-color-strategy.md
Code: vendor/silvery/packages/ansi/src/theme/detect.ts
Parent: @km/silvery/design-system
Merged: capability-detection, tier-override, theme-detect-gaps
