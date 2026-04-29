---
id: "@km/logview/logrow-complexity"
aliases:
  - km-logview.logrow-complexity
  - km-logview-logrow-complexity
created_by: claude:c56dc5d6
created_at: 2026-04-23T21:05:33Z
closed_at: 2026-04-23T21:21:02Z
close_reason: 6646c4cf3 — LogRowView + deriveRows split into focused
  sub-components; 0 complexity violations in apps/km-logview/src/row/; 42/42
  tests pass
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-logview.logrow-complexity
    depends_on_id: km-logview
    type: parent-child
    created_at: 2026-04-23T14:05:38Z
    created_by: claude:c56dc5d6
    metadata: "{}"
---

# [x] Refactor LogRowView + deriveRows to meet complexity limits @km/logview #task #P3

blocks:: [[@km/logview]]

Current state: LogRowView (cyclomatic 51/max 50, cognitive 78/max 50) and deriveRows (cognitive 64/max 50) fail oxlint complexity gates. Pre-existing — not session scope when introduced but needs resolving.

Approach: decompose LogRowView into focused sub-components (HeaderRow, BodyInline, BodyCollapsed, BodyExpanded, BodyFlat) and extract deriveRows helpers (pure functions per body shape). Keep the public renderItem contract unchanged.

Acceptance:
- bun fix passes with 0 complexity errors on apps/@km/logview/src/row/
- no behavior change (tests pass)
- LogRowView.tsx file stays readable with inverted-pyramid structure