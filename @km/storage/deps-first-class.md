---
id: "@km/storage/deps-first-class"
aliases:
  - km-storage.deps-first-class
  - km-storage-deps-first-class
created_by: claude:bjorns-2026-05-03
created_at: 2026-05-03T15:30:00Z
type: refactor
priority: P2
parent: "@km/storage"
---

# Consolidate `deps` as a first-class universal prop @km/storage #refactor #P2

Today, dependencies live in two places with different shapes:

- `data.dependencies` — frontmatter `dependencies:` array on file beads.
- `data.props["blocked-by"]` — Logseq-style inline property; indexed by the
  `deps` SQLite table via triggers.

Per the 2026-05-03 reframe: dependencies are a **universal** node concept (a
note can depend on a note, a calendar entry on a task, anything on anything)
and the data model should have one canonical home for them. This bead
consolidates the two representations into one first-class authored list,
keeping the indexed `deps` table as the reverse-lookup cache.

## Why

- Two parallel representations of the same concept invite drift —
  authoring tools can write one and not the other; the resolver has to
  check both.
- Logseq-style inline `blocked-by::` is the more general pattern (it
  works on any block, not just file headers); the frontmatter list is a
  YAML-specific affordance.
- Once `node.deps` is first-class, the indexed `deps` table becomes pure
  reverse-lookup (target → host), no longer needing different paths for
  frontmatter vs. inline.

## Implementation sketch

1. Promote to first-class authored list:
   - Either a `nodes.deps` column (JSON-encoded) or a normalized
     `node_deps(node_id, target, kind?)` table. Lean toward normalized —
     the indexed `deps` table already exists in this shape, and the
     authored list could just BE the `deps` table.
2. Reconcile representations:
   - On read: parse both `data.dependencies` (legacy frontmatter) and
     `data.props["blocked-by"]` (inline) into the same `node.deps`.
   - On write: emit one canonical form per consumer (frontmatter for file
     beads, inline for in-body deps).
3. Indexed lookup stays unchanged: `SELECT host_id FROM deps WHERE target
   = ?` for "what depends on X."

## Acceptance

- `node.deps` (or equivalent) is the single read-side surface for
  authored dependencies, regardless of authoring form.
- The indexed `deps` table stays the reverse-lookup primitive.
- Writes: existing producers (frontmatter parser, inline-prop parser) feed
  the same path.
- Round-trip test: file bead with `dependencies: [@km/foo]` and bead
  with `blocked-by:: [[@km/foo]]` both surface the same `node.deps`.

## Out of scope

- Removing the inline-prop syntax. Logseq-style props are universal and
  stay.
- Removing the frontmatter `dependencies:` syntax. Stays for YAML-first
  consumers.

## Pairs with

- `@km/all/drop-data-tags` (P3) — same denormalization-vs-cache pattern.

## Related

- Tracking epic: `@km/all/path-name-id-redesign`.
- Origin: 2026-05-03 reframe.
