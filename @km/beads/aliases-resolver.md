---
id: "@km/beads/aliases-resolver"
aliases:
  - km-beads.aliases-resolver
  - km-beads-aliases-resolver
created_by: claude:da9990c5
created_at: 2026-04-28T00:32:00Z
closed_at: 2026-04-28T02:53:34Z
close_reason: Shipped in commit ede04bd5a (staged work was bundled into a peer
  agent's commit by concurrent git activity, but all code is present in that
  SHA).
---

# [x] Resolver indexes aliases from frontmatter @km/beads #task #P1

short-ids.ts resolveShortId checks data.aliases (array) in addition to data.short_id. queries.ts respects aliases. Acceptance: km bd show <legacy-id> resolves to new file; km bd show @km/scope/slug also resolves; tests cover both paths.