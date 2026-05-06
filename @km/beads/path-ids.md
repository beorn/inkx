---
mentions:
  - km
id: "@km/beads/path-ids"
aliases:
  - km-beads.path-ids
  - km-beads-path-ids
created_by: claude:da9990c5
created_at: 2026-04-28T00:31:59Z
closed_at: 2026-04-28T02:53:32Z
close_reason: Shipped in commit ede04bd5a (staged work was bundled into a peer
  agent's commit by concurrent git activity, but all code is present in that
  SHA).
owner: bjorn@stabell.org
---

# [x] Migrate writes path-form filenames + aliases frontmatter @km/beads #task #P1

migrate.ts writes issue/<scope>/<slug>.md instead of issue/<id>.md, with frontmatter id: <scope>/<slug> and aliases: [<legacy-id>]. Acceptance: dry-run on real .beads/issues.jsonl produces correct tree shape; round-trip (read alias-bearing file, parse back) preserves identity; --legacy flag falls back to flat filenames for compat.

