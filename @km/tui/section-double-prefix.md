---
id: "@km/tui/section-double-prefix"
aliases:
  - km-tui.section-double-prefix
  - km-tui-section-double-prefix
created_by: Bjørn Stabell
created_at: 2026-04-15T15:39:53Z
closed_at: 2026-04-15T15:40:28Z
close_reason: "Fixed in 2805a2f32: NodeColumnView checks
  displayName.trimStart().startsWith('§') and skips the '§ ' prefix when the
  source heading already begins with the marker. Single-prefix behavior
  preserved for headings that don't already have it. Spotted via user dogfood
  screenshot on RESOLVER.md."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tui.section-double-prefix
    depends_on_id: km-tui
    type: parent-child
    created_at: 2026-04-15T08:40:22Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] § doubled in section header when source heading starts with § @km/tui #bug #P3

blocks:: [[@km/tui]]

NodeColumnView in apps/@km/tui/src/views/NodeView.tsx hardcoded a "§ " prefix on every section column header. When the source markdown heading already starts with § (e.g. RESOLVER.md convention "## § 4 — Filename conventions"), the rendered column header read "§ § 4 — …". User dogfood surfaced this on 2026-04-15.

Fix: skip the prefix when displayName.trimStart() already starts with § (U+00A7). Landing commit pending.