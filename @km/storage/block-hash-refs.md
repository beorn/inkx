---
id: "@km/storage/block-hash-refs"
aliases:
  - km-storage.block-hash-refs
  - km-storage-block-hash-refs
created_by: claude:8b5b9e1c
created_at: 2026-04-21T20:26:24Z
closed_at: 2026-04-21T22:29:33Z
close_reason: Folded into km-storage.identity-recovery-cascade — block hash refs
  and identity are tightly coupled and ship together. See consolidated scope
  there.
---

# [x] Block hash refs — hashBlockId(ulid), default 3 chars, per-ref auto-extend @km/storage #feature #P1

blocks:: [[@km/storage/fs-mount]]

Implement block-ref serialization as `^<hash(NodeId)>` with per-ref auto-extend. Lives inside `@km/fs-adapter`.

## The design

- Every KNode has a ULID \`id\`. Block refs in markdown are \`^<hashBlockId(node.id)>\` — a pure function of the ULID, not a stored field.
- Default hash length: **3 chars base62** (62³ = 238,328). Essentially zero collision probability for typical files.
- **Per-ref auto-extend on collision**: if writing a new ref at N chars would collide with an existing ref in the file, write THIS ref at N+1 chars. Existing refs stay at their current length.
- **Mixed-length refs in one file are supported**.
- Parser uses longest-prefix match.
- Optional \`block_hash_length:\` in frontmatter (advisory only).

## Why per-ref, not per-file

Global file rewrite on first collision would invalidate cross-file backlinks pointing at short hashes. Per-ref preserves stability: existing refs never change; only new refs get extended hashes.

## Collision math

For typical files with < 20 referenced blocks: collision probability at 3 chars ≈ 0.08% (birthday). At 50 refs: ≈ 0.5%. Auto-extend handles the long tail.

## Serializer responsibilities

- On write: compute hashBlockId(node.id), pick minimum length that doesn't collide within file.
- Track each ref's hash-length so parser can disambiguate.

## Parser responsibilities

- On read: for \`^<hash>\`, scan file's blocks, find one where hashBlockId(b.id).startsWith(hash) is unique. If multiple matches, log warning + tiebreak by oldest.

## KNode.block_id field removal

- Stop writing to block_id field anywhere.
- Migrate any reliance (grep \`node.block_id\`) to use hashBlockId(node.id).
- Deprecation period: one release.
- Delete field from KNode type.

## Acceptance

- [ ] hashBlockId() pure function implemented in @km/fs-adapter (or @km/markdown if parse/serialize stays there)
- [ ] Serializer auto-extends on collision
- [ ] Parser longest-prefix match + ambiguity resolution
- [ ] block_id? field removed from KNode after migration
- [ ] Cross-file backlinks remain stable through per-ref extension
- [ ] Unit tests at various collision densities

## Depends on

- @km/storage/fs-mount (parent)

## RFC reference

`hub/km/source-of-truth-rfc-v2-addendum-identity.md` §3.2