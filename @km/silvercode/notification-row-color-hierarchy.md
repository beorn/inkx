---
mentions:
  - km
id: "@km/silvercode/notification-row-color-hierarchy"
aliases:
  - km-silvercode.notification-row-color-hierarchy
  - km-silvercode-notification-row-color-hierarchy
created_by: claude:2405c72e
created_at: 2026-04-28T22:17:13Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvercode.notification-row-color-hierarchy
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-28T15:17:13Z
    created_by: claude:2405c72e
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvercode
---

# [ ] NotificationEventRow: revisit color hierarchy (loud sources vs muted) @km/silvercode #task #P3 #design

blocks:: [[@km/silvercode]]

NotificationEventRow.tsx maps source -> {icon, color} (lines 60-69):\n  tribe       -> $info       (calm cyan)\n  ci          -> $success    (green — implies success even on failure)\n  recall      -> $accent     (highlighted)\n  sub-agent   -> $primary    (loud — pops in a stream)\n  filewatch   -> $muted      (good — should fade)\n  telegram    -> $warning    (yellow — no semantic warning)\n\nIssue: $success on ci row paints green even when CI FAILED (the content carries the failure but the icon is still green). Same for telegram on $warning — telegram payload isn't actually a warning, just a channel signal. Per Silvery Way principle 6 ('Use Tokens for Meaning, Not Decoration'), borrowing status colors for source identity trains users to ignore them.\n\nProposal: separate identity from status. Source icon stays semantically neutral ($fg-muted or per-source category color from $color0..$color15 palette which is for data categories). The CONTENT block can carry a status icon if the event is itself success/failure (CI passed/failed). E.g. ci row: '◉ ci  17:42  ✓ 245 tests passed' (passed=$fg-success in body, icon stays neutral).\n\nAlternative: keep semantic colors but only fire them when the content matches (parse 'passed'/'failed'/'error' tokens, paint accordingly). More UX work but truer to semantic-token discipline.\n\nDiscovered during @km/silvercode/design-review walkthrough. Tagged P3 because the bead is a judgment call rather than a defect — content of the All/together story currently shows a 'CI passed' line so the green-icon gloss happens to match.

