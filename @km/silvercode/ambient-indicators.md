---
mentions:
  - km
id: "@km/silvercode/ambient-indicators"
aliases:
  - km-silvercode.ambient-indicators
  - km-silvercode-ambient-indicators
created_by: claude:2405c72e
created_at: 2026-04-28T19:36:38Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvercode.ambient-indicators
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-28T12:36:38Z
    created_by: claude:2405c72e
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvercode
---

# [ ] Ambient stream / background tasks visible — sub-agent + bg-task chips @km/silvercode #feature #P2

blocks:: [[@km/silvercode]]

Long-running sub-agents (Task tool) and backgrounded turns (Ctrl+B) should be visible. Currently the SidePanel has 'Agents 0/0' and 'Background N' rows but they're easy to miss.

Add an ambient strip near the bottom-chrome (above the composer): N agents running · M bg tasks · K shells. Each chip clickable to drill into the running ones.

Files: apps/silvercode/src/components/AmbientStrip.tsx (new), App.tsx (wire it in above SessionPromptComposer), use-background-tasks.ts (already exists).

Acceptance:

- AmbientStrip renders ONLY when count > 0 (zero rows when idle)
- Click on chip opens the corresponding panel (background-tasks history, agents list, shells panel)
- termless test: 2 agents running + 1 bg task → strip shows '◇ 2 agents · ▣ 1 bg'

