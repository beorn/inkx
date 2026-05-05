---
id: "@km/beads/path-form-id-frontmatter-missing"
aliases:
  - km-beads.path-form-id-frontmatter-missing
  - km-beads-path-form-id-frontmatter-missing
created_at: 2026-05-05T21:30:00Z
type: bug
priority: P2
parent: "@km/beads"
---

# bd create --path writes frontmatter with only aliases — close/update can't resolve the bead @km/beads #bug #P2

blocks:: [[@km/beads]]

## Repro

```
km bd create "x" --path @km/test/foo --type task
km bd close @km/test/foo --reason "x"
# → Bead not found: @km/test/foo
```

## Why this is the right semantic to fix

Per `@km/beads/data-id-stop-writing` (closed) the architectural decision is:
**the file's path-form IS the canonical id; do NOT write `id:` in YAML.**
`renderBeadFile` (mutations.ts:351) and `renderInboxCapture` (mutations.ts:275)
correctly emit `aliases:` only.

But `nodeToBead` (queries.ts:335) still derives bead identity exclusively from
`data.id` or `data.short_id`:

```ts
const shortId = (data?.id as string | undefined) ?? (data?.short_id as string | undefined)
```

For new beads the loader does not populate `data.id` (no YAML field to read), and
`data.short_id` is also absent. So `Bead.from()` returns null, and every CLI
subcommand that uses `resolveIssue` (close, update, drop, claim, comment, mention)
fails with "Bead not found" — even though `bd show` (which uses the never-null
`nodeToBeadRaw` fallback) and `repo.resolveNode` find the file fine.

## Fix

Add an `fs_path`-derived path-form fallback to the `shortId` chain in
`nodeToBead`. If the node has an `fs_path` (i.e., it IS a file on disk), the
canonical id is `fsPathOf(node)` (the same path-form `displayId` and the
filesystem already use). This closes the loop opened by `data-id-stop-writing`:
the file's location IS the canonical id, including for `Bead.from`'s nullness
check.

## Acceptance

- `km bd create "test" --path @km/test/foo --type task` succeeds
- `km bd close @km/test/foo` succeeds; status becomes `done`
- The bead's markdown does NOT have a redundant `id:` YAML field (the closed
  `data-id-stop-writing` decision)
- A regression test in `apps/km-cli/tests/` covers the create→close round-trip
  via `--path` and asserts `Bead.from(node)` returns non-null when the file is
  the canonical id source
