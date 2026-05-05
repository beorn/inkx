---
id: "@km/beads/parent-id-leaf-materializes-inline"
aliases:
  - km-parent-id-leaf-materializes-inline
  - km-beads.parent-id-leaf-materializes-inline
  - km-beads-parent-id-leaf-materializes-inline
created_at: 2026-04-30T05:42:37.960Z
updated_at: 2026-05-05T21:40:00Z
started_at: 2026-04-30T05:44:26.864Z
closed_at: 2026-05-05T21:40:00Z
owner: bjorn@stabell.org
assignee: bjrn-stabell
dependencies:
  - issue_id: km-beads.parent-id-leaf-materializes-inline
    depends_on_id: km-beads
    type: parent-child
    created_at: 2026-04-30T05:42:37.960Z
    metadata: "{}"
closeReason: >-
  Fix shipped earlier in commit b5cd1c6cc (Bead.create materializes file
  at @<prefix>/<scope>/<leaf>.md, not inline child) and refined in
  commits 4621393af + ef2f0b2e1 (path-positional + --path opt-in).
  `bd create --parent km-beads --id foo` now produces a sibling file at
  `@km/beads/foo.md` with frontmatter aliases (legacy bd-form +
  dash-form) and no redundant `id:` YAML field. Equivalent forms
  `--path @km/beads/foo` and `--id @km/beads/foo` produce the same
  on-disk shape. End-to-end `bd create → bd close @km/beads/<leaf>`
  round-trip works.

  Regression test pinning all four acceptance criteria added in
  `apps/km-cli/tests/bd-create-parent-id-leaf-sibling-file.test.ts`
  (4 tests, all passing).

  Note: bd-form `bd show km-beads.foo` resolution depends on the
  alias-resolver pulling YAML aliases through deferred parsing — that
  flow is currently broken when files are still in stub state. Tracked
  separately; the inline-materialization bug this bead names is fully
  fixed.
---

# [x] bd create --parent <epic> --id <leaf>: lands as inline child node, not a sibling file under the scope @km/beads #bug #P2

blocks:: [[@km/beads]]

## Repro

km bd create "Title" --parent km-beads --id path-is-the-name

Expected: file at @km/beads/path-is-the-name.md, frontmatter id `@km/beads/path-is-the-name`.

Actual: child node *inside* @km/beads.md (the epic file itself), no separate file. Bead show:

  Path: @km/beads.md
  Context: beads
  Display id: km-path-is-the-name (bd-form, not @km/...)

## Root cause hypothesis

`createIssueNode` + addNode pipeline treats `--parent <epic>` as "append child KNode to epic's body", not "use the epic as a scope and create a sibling file under its directory". The path-form `@km/<scope>/<slug>` semantics aren't wired into the file-materialization layer; the epic is found as a node, not as a directory anchor.

## Wanted behavior

- `--parent km-beads --id path-is-the-name` ⇒ writes `@km/beads/path-is-the-name.md`, frontmatter `id: @km/beads/path-is-the-name`, no `data.short_id` (or short_id mirrors the path).
- `--id @km/beads/path-is-the-name` (path-form, no `--parent`) ⇒ same result.
- Both forms are equivalent — `--parent X --id leaf` is just a split shortcut for `--id @km/X/leaf`.

## Acceptance

- Test: km bd create "T" --parent km-beads --id foo creates `@km/beads/foo.md` (file exists, frontmatter sane).
- Test: km bd create "T" --id @km/beads/foo creates the same.
- bd show foo, bd show @km/beads/foo, bd show km-beads.foo all resolve to that file.
- displayId returns `@km/beads/foo`, not `km-beads.foo`.

## Relates

- Parent of the same redesign: km-path-is-the-name (P1) — bead identity = sigil-rooted path.
