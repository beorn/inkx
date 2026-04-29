---
id: "@km/tui/normalize-plugins"
aliases:
  - km-tui.normalize-plugins
  - km-tui-normalize-plugins
created_by: Bjørn Stabell
created_at: 2026-04-02T05:29:31Z
closed_at: 2026-04-02T05:44:39Z
close_reason: "Shipped: withTitle + withName plugins + validateEffects invariant
  checker. Wired into board-effect-runner. 16 tests. Commit 90202575."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Normalization plugins: withTitle, withName — auto-derive fields on mutation @km/tui #task #P2 @Bjørn Stabell

SlateJS-style normalization plugins that intercept Board.apply effects and auto-derive fields.

ROOT CAUSE (from /why analysis): KNode has no declared field dependencies. content, title, name are independently settable. Callers of updateNode must know which fields derive from which — and regularly forget (see commit dff82084 title/content divergence bug).

DESIGN: withTitle plugin overrides apply() — when any REPO_UPDATE_NODE effect has content changed, auto-set title = content. Same pattern for withName (derive name from content for outline nodes).

Plugin shape:
  type NormalizePlugin = (apply: Apply) => Apply
  
  withTitle: intercepts REPO_UPDATE_NODE effects, sets title = content
  withName: intercepts REPO_UPDATE_NODE effects, sets name = content.replace(taskMarkerRe, '') for outline nodes

Depends on: Board.apply effect runner (commit 6a4c2837, board-effect-runner.ts)

After this ships, revert the manual title: newContent additions from dff82084 — they become redundant.