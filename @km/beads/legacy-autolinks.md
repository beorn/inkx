---
mentions:
  - km
id: "@km/beads/legacy-autolinks"
aliases:
  - km-beads.legacy-autolinks
  - km-beads-legacy-autolinks
created_by: claude:da9990c5
created_at: 2026-04-28T00:32:01Z
closed_at: 2026-04-28T02:53:33Z
close_reason: Shipped in commit ede04bd5a (staged work was bundled into a peer
  agent's commit by concurrent git activity, but all code is present in that
  SHA).
owner: bjorn@stabell.org
---

# [x] Regex autolinks rewrite bd-form ids in prose @km/beads #task #P1

@km/markdown autolinks pattern: <prefix>-<scope>.<slug> and <prefix>-<scope>-<slug> rewrite to wikilink @<prefix>/<scope>/<slug>. Acceptance: prose containing 'see @km/storage/foo' renders as link; resolution is the catch-all when frontmatter aliases don't have an entry; help text mentions both forms accepted.

