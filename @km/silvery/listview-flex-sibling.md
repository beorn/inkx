---
id: "@km/silvery/listview-flex-sibling"
aliases:
  - km-silvery.listview-flex-sibling
  - km-silvery-listview-flex-sibling
created_by: claude:c6244087
created_at: 2026-04-23T07:59:39Z
closed_at: 2026-04-23T08:26:22Z
close_reason: "NOT a ListView bug — fixed in silvery 089f6261. Root cause:
  create-app.tsx built TermContext via createTerm({color:truecolor}) which read
  process.stdout dims (80x24) instead of emulator's dims, so useWindowSize
  reported wrong rows in termless. Fix: seed mock Term with currentDims via
  createHeadlessTerm + createFixedSize. 6 new tests. km-agent-view Composer
  reverted from listFooter workaround to proper flex sibling (eb8ec65f3). This
  is the same class as defaults-contract — TermContext invariants bound by
  convention, not types. Strong argument for Plateau Phase 2 (Term.caps
  required)."
owner: bjorn@stabell.org
assignee: claude:c6244087
dependencies:
  - issue_id: km-silvery.listview-flex-sibling
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-23T01:00:04Z
    created_by: claude:c6244087
    metadata: "{}"
---

# [x] ListView height={N} doesn't behave as rigid row-budget in a flex column; absorbs all rows below siblings @km/silvery #bug #P2 @claude:c6244087

blocks:: [[@km/silvery]]

Discovered in @km/agent-view v0 scaffold (task #14):

Attempted: outer `<Box flexDirection="column" height={termRows}>` with SessionTabs (flexShrink:0 height:1) + ListView (height:18) + Composer (flexShrink:0 height:1).

Observed: Composer never renders regardless of whether outer height is set or omitted. ListView's internal `<Box height overflow="scroll">` seems to occupy all rows below SessionTabs.

Workaround: render Composer as `listFooter` (matches `hub/silvery/prototype/aichat-v2/app.tsx` InputFooter pattern). Downside: composer scrolls with the stream instead of pinning bottom.

Fix shape: verify ListView respects its own `height` prop when siblings have `flexShrink:0`. Likely the internal Box needs `flexShrink:0` too, or ListView should honor its height as a hard bound not a minimum.