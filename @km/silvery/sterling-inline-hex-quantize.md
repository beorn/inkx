---
id: "@km/silvery/sterling-inline-hex-quantize"
aliases:
  - km-silvery.sterling-inline-hex-quantize
  - km-silvery-sterling-inline-hex-quantize
created_by: claude:4274df30
created_at: 2026-04-19T23:47:42Z
started_at: 2026-04-25T07:14:19Z
owner: bjorn@stabell.org
assignee: claude:22c2717d
dependencies:
  - issue_id: km-silvery.sterling-inline-hex-quantize
    depends_on_id: km-all.sterling
    type: parent-child
    created_at: 2026-04-24T16:13:00Z
    created_by: claude:5e447b66
    metadata: "{}"
---

# [ ] Sterling: quantize inline hex values per caps.colorLevel @km/silvery #feature #P4 @claude:22c2717d

blocks:: [[@km/all/sterling]]

Follow-up from sterling-tier-override (shipped 2026-04-19, fc758f89). Flagged inline-hex gap:

## The gap

`<Text color='#ff0000'>Alert</Text>` stays #ff0000 even under `run({ colorLevel: 'ansi16' })`. Only 'mono' / 'none' strips inline hex today. Theme-sourced colors DO quantize via pickColorLevel pre-quantization at mount time.

## Why this happens

parseColor() in render-helpers.ts returns {r,g,b} for a hex string regardless of caps.colorLevel. fgColorCode() always emits \x1b[38;2;R;G;Bm for RGB input. The output-phase check at lines 639/648 only strips at 'none'.

## Proposed

Extend parseColor / fgColorCode / bgColorCode to consult caps.colorLevel. When colorLevel='ansi16' or '256', route the RGB through quantizeHex before emitting SGR — or directly emit \x1b[3Nm (ansi16) / \x1b[38;5;Nm (256) instead of truecolor SGR.

## Acceptance

- <Text color='#bf616a'> under run({ colorLevel: 'ansi16' }) emits nearest-ANSI16 slot SGR (e.g. \x1b[31m), NOT \x1b[38;2;191;97;106m
- Same text under run({ colorLevel: '256' }) emits \x1b[38;5;Nm with N = nearest 256-cube index
- Truecolor behavior unchanged
- Tests with termless verifying the actual SGR bytes emitted match colorLevel

## Scope

~100 LOC in render-helpers + output-phase. Touches pipeline — silvery agent.

## Why P4 not now

Sterling 0.19.0 plateau is critical path (2c → 2d → ...). Theme tokens work correctly; this is edge cases with inline hex. Apps that care can pass theme via pickColorLevel manually until this ships.

## Related

- Parent: @km/silvery/theme-v4 (implicitly — edge case of colorLevel behavior)
- Enabled by: sterling-tier-override (closed, shipped fc758f89)