---
id: "@km/all/km-spec-typed-primitives"
aliases:
  - km-all.km-spec-typed-primitives
  - km-all-km-spec-typed-primitives
created_by: claude:da9990c5
created_at: 2026-04-28T19:42:48Z
closed_at: 2026-04-28T20:16:16Z
close_reason: >-
  Wrong framing — see km-spec.bootstrap close reason for full rationale.


  TL;DR: bd is import-only (Asana model); sigil is a string-prefix property, not
  a structural field; @km/core/sigils.ts already owns this charter. The two
  narrow improvements that survived the analysis:


  - stripSigil(name) added to @km/core/sigils.ts

  - apps/km-tui/src/icons.ts: SIGIL_RE → hasSigilPrefix

  - apps/km-tui/src/views/TreeNode.tsx: redundant 3-arm startsWith removed


  Class-(B) bugs (scope-epic-in-_orphan, sigil-doubled, path-form-drift,
  mem-relocation-confusion) are bd-boundary translation bugs — their fix lives
  inside @km/beads, not in a new exported types package.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-all.km-spec-typed-primitives
    depends_on_id: km-all
    type: parent-child
    created_at: 2026-04-28T12:42:48Z
    created_by: claude:da9990c5
    metadata: "{}"
---

# [x] @km/spec: typed primitives (NodePath, Sigil, BdId, Prefix) with mutation-time invariants @km/all #epic #P2

blocks:: [[@km/all]]

From /big quality analysis 2026-04-28 — refined per user feedback: shape these as domain INTERFACES (type + pure functions), not domain objects with methods.

Class-(B) bugs (recent: scope-epic-in-_orphan, sigil-doubled, path-form-drift, mem-relocation-confusion) all stem from passing structural data as bare strings and re-parsing at every boundary.

Proposal: new package @km/spec with domain types + domain interfaces (per CLAUDE.md three-building-blocks rule):

DOMAIN TYPES (plain data shapes):

  type SigilChar = '@' | '#' | '^'

  interface NodePath {
    readonly sigil: SigilChar
    readonly prefix: string
    readonly segments: readonly string[]
  }

  interface BdId {
    readonly prefix: string
    readonly scope: string | null
    readonly leaf: string | null
  }

DOMAIN INTERFACES (type + pure functions, namespace-style):

  export const nodePath = {
    parse(s: string): NodePath | null,
    toString(p: NodePath): string,
    equals(a: NodePath, b: NodePath): boolean,
    withSegment(p: NodePath, s: string): NodePath,
    parent(p: NodePath): NodePath | null,
  }

  export const bdId = {
    parse(s: string): BdId | null,
    toPath(id: BdId, prefix: string): NodePath,
    toPathSlugAugmented(id: BdId, title: string, prefix: string): NodePath,
    aliases(id: BdId): readonly string[],
  }

NO classes, NO instance methods, NO factories. Plain data + namespaced pure functions. Same shape as @km/core uses today.

Migration:
- bdIdToPathForm in packages/@km/beads/src/migrate.ts → bdId.toPath()
- buildIdMap → bdId-typed map
- issueToMarkdown sigil construction → nodePath.toString()
- rewriteLegacyIdMentions → operates on BdId not strings
- All wikilink resolvers consume NodePath at boundaries

Mutation-time invariants enforced via small assertion helpers (also pure functions):
  - nodePath.assertValid(p): throws if sigil mismatch, segment empty, etc
  - bdId.assertValid(id): throws if prefix empty, etc

Vault-doctor subcommand consumes the same primitives + assertions to scan for drift.

Multi-week effort. Closes class (B) of recent bugs by construction.