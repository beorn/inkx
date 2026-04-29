---
id: "@km/beads/dep-list-from-links"
aliases:
  - km-beads.dep-list-from-links
  - km-beads-dep-list-from-links
created_by: claude:da9990c5
created_at: 2026-04-28T01:34:42Z
closed_at: 2026-04-28T02:01:41Z
close_reason: "getDependencies now unions props-based blockers
  (data.props['blocked-by']) with inbound blocks:: wikilinks scanned from the
  nodes table. Until km-storage emits a typed rel:'blocks' taxonomy on the links
  table (filed as a follow-up consideration), bd dep list scans for paragraph
  content matching 'blocks:: ... [[<slug>]]' and treats the host file as a
  blocker. Verified on /tmp/km-bd-sample-11544: bd dep list
  silvercode/acp/session-prompt now reports silvercode/acp/rename as the
  blocker."
---

# [x] bd dep list reads from the links table, not data.blocked_by array @km/beads #bug #P2

blocks:: [[@km/beads]]

Today bd dep list and isBlocked check data.blocked_by (legacy bd-form). Multi-blocker via inline-property wikilinks (blocks:: [[a]], [[b]]) are correctly indexed in the links table but invisible to bd dep. Acceptance: bd dep list <id> queries links table for outgoing blocks/blocked-by/related/supersedes edges; isBlocked checks current status of each link target through the resolver; help text mentions inline-property wikilinks as the canonical way to declare deps.