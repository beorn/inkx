---
mentions:
  - km
id: "@km/infra/sop-inline-render"
aliases:
  - km-infra.sop-inline-render
  - km-infra-sop-inline-render
created_by: Bjørn Stabell
created_at: 2026-04-13T00:50:59Z
closed_at: 2026-04-13T00:52:23Z
close_reason: "Pushed back: silvery inline rendering is overkill for a dev tool
  with mixed stderr/stdout, streaming progress, and piping needs. createStyle
  with correct theme colors is the right level."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-infra.sop-inline-render
    depends_on_id: km-infra.sop
    type: parent-child
    created_at: 2026-04-12T17:51:16Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-infra.sop
---

# [x] SOP tool: convert output to silvery inline rendering @km/infra #task #P3

blocks:: [[@km/infra/sop]]

Replace createStyle() console.log output in tools/sop.ts with silvery inline mode (run(<Dashboard />, { mode: 'inline' })). Use H1, H2, Muted, Text with $tokens for all user-facing output. ~200 lines of console output → React components.

