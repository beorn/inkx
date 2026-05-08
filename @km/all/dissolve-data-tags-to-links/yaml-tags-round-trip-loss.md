---
aliases:
  - km-all.dissolve-data-tags-to-links.yaml-tags-round-trip-loss
  - km-all-dissolve-data-tags-to-links-yaml-tags-round-trip-loss
created_at: 2026-05-08T23:53:00.951Z
---

# Serializer drops YAML tags: after first round-trip #bug #P1

User-authored YAML frontmatter `tags:` (and likely `projects:`, any other sigil-shaped keys) is silently dropped after one round-trip through the parser+serializer.

Repro: write a file with YAML frontmatter `tags: [project, work]`. Run any sync that goes file→DB→file (e.g. mutating any task in the file). The re-serialized file no longer has `tags:` in frontmatter.

Mechanism: after L5 Phase 2/3 (commits b6d22a4b0, 4c3088a8b), `collectSigilLinks` (packages/km-markdown/src/ast2nodes.ts:1241) extracts YAML `tags:` into the links table as km:#<tag> rows then calls `delete fileData.tags`. The serializer at packages/km-markdown/src/nodes2md.ts:237 has a stale comment claiming 'Original frontmatter values (tags, mentions, projects, title) are preserved' but writes `node.data` without the tags field, so YAML output omits them.

Acceptance: serializer reconstructs YAML `tags:` (and any sigil-shaped key) from outgoing km:#* link rows on the file node before emitting frontmatter. Authored tags survive arbitrarily many round-trips. Test gate: re-add the dropped FS-content assertions in content-roundtrip.fuzz.ts (`expect(content).toContain('- project')`, `'- work'`) and confirm they pass. Update the nodes2md.ts:237 comment to match the (then-correct) behavior. Same fix should generalize to projects: and any future sigil-shaped frontmatter key — investigate whether mentions: has the same loss profile while you're in there.
