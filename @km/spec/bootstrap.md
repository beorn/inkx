---
id: "@km/spec/bootstrap"
aliases:
  - km-spec.bootstrap
  - km-spec-bootstrap
created_by: claude:da9990c5
created_at: 2026-04-28T19:48:22Z
closed_at: 2026-04-28T20:16:06Z
close_reason: >-
  Closed without merging — wrong framing, package deleted.


  Agent's work (packages/km-spec/) was deleted in this session because:


  1. SigilChar alphabet drift: agent declared '@ # ^' while @km/core/sigils.ts
  has the production set '@ # +'. Parallel derivation of an existing charter
  (arch agent flagged).


  2. NodePath had a 'prefix' field; user clarified prefix is bd-specific and
  shouldn't leak out of @km/beads.


  3. BdId / bd-form parsing was duplicated in @km/spec; user clarified bd is
  Asana-style import-only and lives entirely in @km/beads.


  Replacement (already shipped this session):


  - @km/core/sigils.ts gained stripSigil(name); hasSigilPrefix / getSigilChar
  already existed. That covers the actual missing helpers.

  - apps/km-tui/src/icons.ts now uses hasSigilPrefix instead of a local
  SIGIL_RE.

  - apps/km-tui/src/views/TreeNode.tsx redundant 3-arm startsWith check removed.


  23 sigils tests + 2534 km-tui tests pass. bun fix clean. No new package
  needed.
---

# [x] Bootstrap @km/spec package with NodePath, BdId, SigilChar types + namespaced functions + tests @km/spec #task #P2 @claude:da9990c5

blocks:: [[@km/all/km-spec-typed-primitives]]

Bootstrap @km/spec package with NodePath, BdId, SigilChar types + nodePath/bdId namespaces of pure functions + test suite. Do NOT migrate existing callers in this iteration — that is separate sub-beads. This bead lands the foundation only.