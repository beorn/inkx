---
id: "@km/all/path-derivation-helper"
aliases:
  - km-all.path-derivation-helper
  - km-all-path-derivation-helper
created_by: claude:bjorns-2026-04-30
created_at: 2026-04-30T09:22:00Z
type: feature
priority: P2
parent: "@km/all"
---

# Path-derivation helper: pathOf(repo, id) → string @km/all #task #P2

Single source of truth for materializing a node's path from its id. Used by the markdown serializer (frontmatter), CLI display, wikilink emit, and anywhere else a node needs to be presented to humans.

## API

```typescript
// In @km/storage or @km/core (location TBD during implementation):
export function pathOf(repo: Repo, id: string): string | null {
  // Walk parent_id chain from `id` to root, collecting `name`s.
  // Reverse, prefix with the root's sigil, join with "/".
  // Returns null if `id` doesn't exist.
}
```

Examples:
- `pathOf(repo, <foo-ulid>)` → `"@km/beads/foo"`
- `pathOf(repo, <repo-root-ulid>)` → `""` or `"@km"` (root convention TBD)
- `pathOf(repo, <unanchored-paragraph-ulid>)` → null (paragraphs without stable names don't have a path)

## Why

Per `.claude/arch-decisions/2026-04-30-path-vs-ulid-as-sqlite-pkey.md`, path is composed from `(parent walk + name)`. Today this composition is scattered across:
- The markdown serializer (writes frontmatter `id:`)
- The CLI display path (prints bead refs)
- Wikilink emitters
- Migration code in `bdIdToPathForm`

Centralizing into one helper:
1. Eliminates drift between layers (everyone calls the same function).
2. Single place to handle the "node has no stable path" case (return null; caller decides what to display).
3. Single place to optimize (memoize, cache the parent walk, etc.).

## Implementation notes

- **Fast path**: for fs-materialized nodes (`fstype IS NOT NULL`), the path is already stored as `fs_path`. `pathOf` becomes a one-liner: `node.fs_path?.replace(/\.md$/, '') ?? null`. No walk needed.
- **Fallback path**: for nodes without an `fs_path` (mdsections inside files, or any future sub-file-level node with stable identity), walk the parent_id chain collecting names, reverse, join with `/`. Stops at the nearest ancestor with `fs_path`; prepends that.
- Memoization: optional. The fast path is already O(1) (one column read); the walk is O(depth) bounded by 3-5 levels for beads. Cache only if a profiler shows hotness.

## Acceptance

- `pathOf(repo, ulid)` returns the path-form for a bead, file, or named section.
- `pathOf(repo, <unnamed-paragraph-ulid>)` returns null.
- `pathOf(repo, <unknown-ulid>)` returns null (not an error).
- Round-trip: for any bead created via `bd create @km/beads/foo`, `pathOf(repo, <its-id>)` returns `"@km/beads/foo"`.
- Single-source check: grep the codebase for inline parent-chain walks that compose paths; replace each with a `pathOf` call. Acceptance grep: zero remaining hand-rolled walks.

## Consumers (touched during this bead)

- Markdown serializer (frontmatter `id:` / `path:` writer) — `packages/km-markdown/`
- CLI bead display — `apps/km-cli/src/commands/bd.ts`
- Wikilink emitter — `packages/km-markdown/src/extensions/wikilinks.ts` (or wherever)
- Migration: `bdIdToPathForm` becomes a thin wrapper around `pathOf` for the migration-from-jsonl path.

## Related

- Origin: `.claude/arch-decisions/2026-04-30-path-vs-ulid-as-sqlite-pkey.md` ("Path is computed, not stored").
- Pairs with: `@km/beads/data-id-stop-writing` (no longer storing the path; computing it is the only way).
