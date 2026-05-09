# Beads should NOT have `tags:` in frontmatter — sync writes duplicates #bug #P1

## Symptom

User-reported 2026-05-09: bead bodies are gaining a `tags:` array in frontmatter with duplicated values:

```yaml
---
created_at: 2026-05-09T01:22:11.537Z
tags:
  - P0
  - P0
  - bug
  - bug
---
```

This is wrong on two axes:

1. **`tags:` shouldn't be in bead frontmatter at all.** The canonical source is the H1 hashtag suffix (`# Title #bug #P0`). Per `.claude/skills/beads/SKILL.md`, the default for a new bead is **no frontmatter at all** — title/type/priority ride the H1's hashtags. Adding `data.tags` is a redundant denormalization.

2. **Duplicates** — the same hashtag appears 2×. Some sync write-path is appending without deduping.

## Likely root cause

Sync materialization is treating bead H1 hashtags (`#bug`, `#P0`) the same way it treats authored content hashtags, and writing them into the `data.tags` array on the file node — then on next round-trip, appending again instead of replacing/deduping.

Compare to agent3's recent `@km/all/dissolve-data-tags-to-links/yaml-tags-round-trip-loss` (3bb171efa) which fixed the YAML `tags: [foo, bar]` round-trip for normal sigil hashtags. This bead may be a separate code path: **bead-specific frontmatter writeback** vs the general YAML serializer.

## Acceptance

- New bead bodies created via `km bd create` have NO `tags:` in frontmatter.
- Existing bead bodies with `tags:` in frontmatter are NOT modified to add duplicates on re-sync; the field is allowed to wither.
- Better: a one-shot migration script to strip `tags:` from all existing bead frontmatter (it's redundant, low-risk to remove).
- Failing test FIRST: read a bead body with `# Title #bug #P0` in H1 and no frontmatter, run a sync round-trip, assert frontmatter doesn't gain `tags:`.

## Related

- `@km/all/dissolve-data-tags-to-links` — parent epic for removing `data.tags` denormalization. This bead is a sibling: dissolve `frontmatter.tags` for beads (the same conceptual fix, different code path).
- `@km/test-infra/deterministic-ulid-factory` — provides the test seam needed if this fix touches reconciler.

## Provenance

Filed by chief 2026-05-09 after user spotted duplicate `tags: [P0, P0, bug, bug]` in a freshly-created bead frontmatter. The behavior is a regression / leftover from the pre-L5 `data.tags` denormalization — fixed for general sigil tags but apparently not for the bead-specific writeback path.
