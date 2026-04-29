---
id: "@km/silvery/design-system-capability-detection"
aliases:
  - km-silvery.design-system-capability-detection
  - km-silvery-design-system-capability-detection
created_by: Bjørn Stabell
created_at: 2026-04-18T05:37:42Z
closed_at: 2026-04-18T05:43:02Z
close_reason: Merged into km-silvery.scheme-detect (unified detection bead)
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.design-system-capability-detection
    depends_on_id: km-silvery.design-system
    type: parent-child
    created_at: 2026-04-17T22:37:44Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] Best-practice capability (tier) detection — truecolor/256/ANSI16/monochrome @km/silvery #feature #P3

blocks:: [[@km/silvery/design-system]]

## Why

The tier decision (which of truecolor / 256 / ANSI16 / monochrome to render at) is separate from slot detection (which 22 values to use). Today silvery detects capabilities ad-hoc; needs canonical consolidation.

## Scope

### Inputs
- NO_COLOR=* (non-empty) → monochrome
- TERM=dumb → monochrome
- !isatty(stdout) → plain/monochrome
- COLORTERM ∈ { truecolor, 24bit } → truecolor
- TERM ends -256color → 256
- TERM matches iterm|vte*|*-truecolor → truecolor
- Windows Terminal → truecolor (no env vars)
- CI detection (specific CI envs may strip)
- Fallback → ANSI 16

### Output

```ts
interface CapabilityDetection {
  tier: 'truecolor' | '256' | 'ansi16' | 'monochrome' | 'plain'
  source: 'NO_COLOR' | 'TERM=dumb' | '!isatty' | 'COLORTERM' | 'TERM' | 'heuristic' | 'forced'
  overrides: { NO_COLOR?, FORCE_COLOR?, SILVERY_COLOR? }
}
```

### Override precedence

1. SILVERY_COLOR env var (from @km/silvery/design-system-tier-override)
2. --color-tier CLI flag
3. NO_COLOR (forces monochrome regardless)
4. FORCE_COLOR (enables but doesn't pick tier)
5. Auto-detection per rules above

## Reference libraries

- termstandard/colors — the canonical COLORTERM reference
- aschey/termprofile — clean typed API we should mirror
- charmbracelet/lipgloss — tier model we align with
- supports-color (npm) — common JS implementation, but doesn't know silvery's needs

## Unification

Silvery has multiple ad-hoc detections. This bead consolidates them into a single detectCapability() function used by:
- deriveTheme mode selection
- Output phase (quantize vs emit hex vs emit slot)
- Fingerprint detection (skip probe if not truecolor-capable)
- NO_COLOR branch
- Tests (force tier via env var)

## Acceptance criteria

- [ ] detectCapability() exported from @silvery/ansi
- [ ] Follows documented detection order
- [ ] Respects SILVERY_COLOR / NO_COLOR / FORCE_COLOR / CLI flag precedence
- [ ] Returns tier + source + overrides
- [ ] Unit tests cover every env-var combo
- [ ] Documented in hub/silvery/design/v10-terminal/terminal-color-strategy.md

## Related

- Parent: @km/silvery/design-system
- Companion: @km/silvery/design-system-tier-override (SILVERY_COLOR env var)
- Reference: hub/silvery/design/v10-terminal/terminal-color-strategy.md
