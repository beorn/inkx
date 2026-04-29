---
id: "@km/silvery/mono-tier-wiring"
aliases:
  - km-silvery.mono-tier-wiring
  - km-silvery-mono-tier-wiring
created_by: Bjørn Stabell
created_at: 2026-04-18T17:45:09Z
closed_at: 2026-04-18T18:23:05Z
close_reason: "Wired deriveMonochromeTheme / monoAttrsFor into the render +
  output pipeline. parseColor returns null for $tokens at mono tier;
  getTextStyle injects per-token SGR attrs from DEFAULT_MONO_ATTRS; output-phase
  strips fg/bg SGR at caps.colorLevel=none. 28 regression tests in
  vendor/silvery/tests/features/mono-tier-attrs.test.tsx. Silvery commits:
  4dd6cca5 (feat), 34f91c31 (test). km commit: c090593ad (bump)."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
dependencies:
  - issue_id: km-silvery.mono-tier-wiring
    depends_on_id: km-silvery.theme-system-v2
    type: parent-child
    created_at: 2026-04-18T10:45:12Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] Output phase emits per-token SGR attrs at mono tier @km/silvery #task #P3 @Bjørn Stabell

blocks:: [[@km/silvery/theme-system-v2]]

Wire deriveMonochromeTheme / monoAttrsFor into the output phase. When colorLevel === 'none', emit SGR attrs (bold, dim, italic, underline, inverse, strikethrough) per-cell based on the token that was painting it.\n\nImplementation:\n- Render phase tracks source token per cell (or per styled region)\n- Output phase dispatches on tier: truecolor → hex, 256 → cube index, ansi16 → named slot, mono → lookup attrs via monoAttrsFor\n- Backdrop-fade already handles tier-dispatch correctly; extend the pattern\n\nResult: SILVERY_COLOR=mono apps preserve hierarchy via attrs even with zero color output.\n\nDepends on: nothing (standalone in pipeline)\nSpec: hub/silvery/design/v10-terminal/theme-system-v2-plan.md#p4