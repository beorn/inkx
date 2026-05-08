---
aliases:
  - km-all.dissolve-data-tags-to-links.content-roundtrip-fuzz-uses-links-table
  - km-all-dissolve-data-tags-to-links-content-roundtrip-fuzz-uses-links-table
created_at: 2026-05-08T23:46:42.292Z
---

# [/] Migrate content-roundtrip fuzz test off stripped data.tags to canonical links table #bug #P2

After L5 Phase 2/3 (b6d22a4b0, 4c3088a8b) stripped data.{tags,projects,mentions,_allMentions,_allProjects} from node payloads, packages/km-storage/tests/sync/chaos/content-roundtrip.fuzz.ts:637 fails reading fileNode.data.tags (undefined). Migrate the assertion to read from the canonical links table via getOutgoingLinks (link.href === 'km:#project' / 'km:#work' for the tags, or query by rel='link' with sigil-prefixed href). Acceptance: content-roundtrip.fuzz.ts passes against current main; no regression in adjacent fuzz tests; the test pattern documents the canonical post-L5 path for asserting tag/project relationships.

