---
mentions:
  - km
  - Bjørn
id: "@km/silvery/boxmetrics-parity"
aliases:
  - km-silvery.boxmetrics-parity
  - km-silvery-boxmetrics-parity
created_by: Bjørn Stabell
created_at: 2026-04-09T14:38:32Z
closed_at: 2026-04-09T15:56:15Z
close_reason: Implemented. useBoxMetrics hook + 7 tests. Commit 7c66bacc.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Review useContentRect vs Ink's useBoxMetrics — adopt name, match API @km/silvery #task #P1 @Bjørn Stabell

Ink 7.0 added useBoxMetrics. We have useContentRect + useScreenRect. Review for API parity and consider renaming for 100% compatibility.

## Investigation

Compare:

- Our useContentRect (+ useScreenRect) in vendor/silvery/packages/ag-react/src/hooks/
- Ink's useBoxMetrics in node_modules/ink/build/hooks/use-box-metrics.js + .d.ts

### Ink's API

\`\`\`typescript
type BoxMetrics = {
  readonly width: number
  readonly height: number
  readonly left: number       // relative to parent
  readonly top: number        // relative to parent
}
type UseBoxMetricsResult = BoxMetrics & {
  readonly hasMeasured: boolean
}
const { width, height, left, top, hasMeasured } = useBoxMetrics(ref)
\`\`\`

### Silvery's API (check current)

- useContentRect returns { width, height } from ContentRect
- useScreenRect returns absolute screen position with scroll offsets
- ref-based or component-internal?

## Decisions to make

1. **Rename useContentRect → useBoxMetrics?**
  - Pro: 100% Ink migration compat
  - Con: Lose descriptive name; "BoxMetrics" is vague
  - Alternative: Export both names — useBoxMetrics as alias
2. **Match the shape?**
  - Add left/top to our API (parent-relative)
  - Add hasMeasured flag
  - Ensure ref-based usage works
3. **Keep useScreenRect separate?**
  - Ink doesn't have equivalent (no scroll containers)
  - Silvery's advantage — keep it
  - useBoxMetrics = parent-relative; useScreenRect = screen-absolute
4. **Document migration path**
  - Ink users should be able to copy-paste useBoxMetrics calls
  - Add to migrate-from-ink.md

## Output

- Decision: rename or alias
- PR updating hooks API
- Updated docs/api/hooks.md
- Migration guide entry

