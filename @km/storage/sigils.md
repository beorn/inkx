---
id: "@km/storage/sigils"
aliases:
  - km-storage.sigils
  - km-storage-sigils
created_by: Bjørn Stabell
created_at: 2026-04-15T19:25:37Z
closed_at: 2026-04-16T23:18:15Z
close_reason: Folded into km-storage.link-model-canonical. Sigil is part of the
  node name; [[@Alice]] and @Alice are the same link to node '@Alice'. No
  separate namespace system.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-storage.sigils
    depends_on_id: km-storage
    type: parent-child
    created_at: 2026-04-15T12:25:37Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] [epic] km sigils — ~, +, @, #, [[]] — strict namespaces + global config @km/storage #epic #P1

blocks:: [[@km/storage]]

Sigils are km's typed link syntax. Five sigils, five distinct namespaces:
- `+project` → project node
- `@context` → context node
- `#tag` → tag node
- `[[node]]` → wikilink node
- `~name` → external lookup (repos/shortlinks from global config)

## Strict namespace model (2026-04-13 decision)

Each sigil forms its own namespace. `+km`, `@km`, `#km`, `[[km]]`, `~km` are FIVE DISTINCT targets — departure from the Obsidian/Logseq model where `#foo` and `[[foo]]` unify.

Rationale: unambiguous-per-notation. One literal → one target. Cross-namespace lookups never match.

## Children

- @km/storage/sigil-strict-namespaces (P1) — parser/resolver/KNode.kind honors namespaces (prerequisite)
- @km/storage/sigil-global-config (P1) — ~/.config/km/config.yml + ~ sigil resolver (depends on strict-namespaces)

## Impact surface

- km parser (AST nodes with namespace tags)
- Link resolver (namespace-restricted lookups)
- KNode.kind (encode namespace as identity)
- docs/design/links.md (canonical link model — needs rewrite)
- docs/concepts.md, docs/inline-ast.md (sigil reference tables)
- Existing vault content (audit for cross-sigil assumptions)

Design source: ~vault/projects/+km/design/repo-model-and-sigils.md