---
id: "@km/beads/name-is-identity"
aliases:
  - km-beads.name-is-identity
  - km-beads-name-is-identity
created_at: 2026-04-30T07:21:52.977Z
type: feature
priority: P2
---

# Bead nesting parenthood (formerly: name-is-identity)

## Status: scope drastically reduced after arch doc-review

A second arch review (`/arch`-protocol style: read all canonical docs + close-reasons of cited beads BEFORE opining) found that this bead's original framing was largely wrong. Quoting the arch report:

> The closed beads do **not** establish "filename IS the identity, drop frontmatter `id:`". They establish a path-form-canonical-id model where path-form `id:` is in frontmatter, with bd-form aliases for resolution. The bead body's claim that `inboxCapture` is the canonical shape (no `id:`) over `renderBeadFile` (with `id:`) inverts the actual recipe.

Canonical sources (read directly, not via grep snapshot):

- `docs/design/model/knode.md:13` — `id: string (ULID)` — storage primary key.
- `docs/design/model/storage.md:259` — `ULID (disk mode) or path:line (memory mode)`.
- `docs/design/model/storage.md:266` — `name = "Identifier slug (filename or heading slug)"`.
- `docs/design/model/storage.md:765-769` — `Names are not unique`. Path resolution is required for uniqueness.
- `docs/design/model/repo-api.md:154-165` — `getNode(id)`, `resolveByName(name)`, `repo.resolve(query)` (smart resolver: path / name / ID / fallback).
- `@km/infra/namespaces.md:9-11` — close-reason cites `hub/km/design/tribe-matrix.md` as authority. The user has flagged that **this specific doc has not been fully vetted**. (Note: not all `hub/` content is draft — `hub/<project>/design/*` is mixed and requires per-doc judgment; some are vetted internal design docs, others are exploration. tribe-matrix.md is the latter for this question.) The close-reason therefore inherits the draft status of its source; the "name = short_id = identity" line is not a binding architectural commitment until tribe-matrix.md is itself vetted.
- `@km/beads/path-ids` close-reason — `migrate writes path-form filenames + aliases frontmatter`. Established 2026-04-28. Recipe is in `mutations.ts:344-392 renderBeadFile` (canonical) and `migrate.ts` (mirror).
- `@km/beads/claim-loses-issue` + `@km/beads/close-drop-data-wipe` close-reasons — established that `id`, `aliases`, `short_id` are sibling keys in `data` that must survive partial-update merges. Frontmatter `id:` is real, persistent, and protected.
- `46bf3552e` (today, L4) — already renamed legacy `Issue`/`displayId`/`nodeToIssue` aliases.

## What was wrong in the original bead

| Claim | Verdict |
|---|---|
| "No frontmatter `id:` field" | **Wrong** — `id:` is the canonical path-form mirror per `path-ids` close-reason. Removing it would break alias resolver. |
| "tribe-matrix.md defines new identity model" | **Wrong on two counts**: (1) I overread it — 8 words about identity in a Matrix-rooms doc. (2) The user has flagged `hub/km/design/tribe-matrix.md` specifically as not-yet-vetted. (`hub/` is mixed — some design docs are authoritative, some are brainstorming; per-doc judgment required.) Even if tribe-matrix.md were vetted, the 8-word identity mention couldn't carry a refactor of this scope. |
| "Rename `Bead.displayId` → `Bead.displayName`" | Already shipped at `46bf3552e` (today's L4). |
| "Stop writing `data.short_id`" | Trivial 30-min cleanup, not bead-scoped. File a tiny child bead and ship. |
| "5 phases / 4-5 hours" | 1 item / 1-2 hours. |

## Target reference model (per user, 2026-04-30)

Two handles per node, each with a clear role:

| Handle | Where stored | Stability | Use when |
|---|---|---|---|
| **Path** (`@km/beads/foo`) | filesystem (`fs_path`) | mutable on move/rename | human refs, wikilinks, navigation, display |
| **ULID** (`KNode.id`) | SQLite (per knode.md:13) | stable across moves | system refs, persistent cross-refs, programmatic lookup |

Notes:
- Path is **sigil-rooted** (e.g. `@km/beads/asdjfkl`), relative to a sigil board root. Already established by the `@`-prefix convention.
- Frontmatter `id:` field **should not exist** — it duplicates the path. Path is on disk; ULID is in SQLite. No third name needed.
- Frontmatter `aliases:` stays for legacy bd-form resolution (`km-beads.foo`, `km-beads-foo`).
- A bead might OPTIONALLY emit its ULID into frontmatter ONLY when it needs to be cross-referenced by a stable handle that survives a move — but that's a write-on-demand thing, not always-present.

## Open architectural question — to resolve via /arch protocol when shipped

Today's reality (per `repo.ts:1419` + `path-ids` bead body): for bead files with frontmatter `id:`, the SQLite primary key is the **path-form**, not the ULID. This contradicts knode.md:13 which mandates ULID. The `path-ids` bead introduced this divergence on 2026-04-28.

Decision needed:
- (A) Restore knode.md model: SQLite primary key always ULID, no frontmatter `id:`. Path is canonical handle, derived from `fs_path`. Migration: drop `id:` from 4752 files, change loader to assign ULID to those rows.
- (B) Accept the path-ids divergence as the new model and update knode.md to match (i.e., for nodes-with-stable-handle-needs, primary key is the path-form).
- (C) Some hybrid not yet articulated.

This decision touches storage primary key, every loader path, every cross-reference resolver, and migration of 4752 files. **Not single-session scope.** Real architectural work — should ride the `/arch` protocol once that skill ships (`@km/all/architectural-decision-skill`, P1).

## What is actually open: directory-nesting parenthood

The single legitimate architectural question:

`isBead` in `packages/km-beads/src/queries.ts:141` requires depth-2 *exactly*. That means `@km/beads.md` (depth-1) is NOT recognized as a bead in the predicate, and `@km/beads/sub/leaf.md` (depth-3) would NOT be recognized either. Whether nested beads at deeper paths are permitted is **undecided** — no close-reason addresses it.

### Acceptance

- `isBead` recognizes depth-≥2 (or has an explicit policy decision: "depth-2 only, period" — and we own that constraint).
- If depth-≥2: `bead.parent` derives from path-prefix; `Bead.children(repo, bead)` returns direct file-children.
- `bd ready` / `bd list` includes nested beads if policy admits them.
- New tests pin the chosen behavior. Existing depth-2-exactly tests are kept or updated coherently.

### Effort

1-2 hours TDD. Single session. No /refactor migrate planning needed.

## Children (re-parented)

- `@km/beads/close-resolver-asymmetric` — already fixed at `2bdab7fb6` regression test. Independent of this bead.
- `@km/beads/parent-id-leaf-materializes-inline` — file-mat fix shipped at `b5cd1c6cc`. Independent.

## DO NOT

- Drop frontmatter `id:` from new mutations — it's the canonical path-form mirror per `path-ids` close-reason.
- Plan a multi-session refactor — scope is one predicate change.
- Use this bead as a tracking surface for the L4/L5 plateau push (that was a misuse; the plateau push has its own beads).

## Process retrospective

Saved memories captured the failure mode:
- `feedback-architectural-decisions-need-big-before-max.md` — `/max` is for parallel execution, not design.
- `feedback-verify-agent-investigation-scope.md` — agent grep snapshots ≠ architectural intent.
- `feedback-hub-docs-are-drafts-not-canonical.md` — `hub/<project>/design/*` is draft territory; never cite as authority.

The user's pull-backs ("isn't this how it always was", "review the architecture", "tribe-matrix isn't fully vetted", "we do not want to change architecture without solid understanding") were the necessary corrections that exposed the failure mode.

Tracking bead for the protocol fix: **`@km/all/architectural-decision-skill`** (P1) — design and ship `/arch` as a skill that enforces doc-first reading + required retro for any identity/storage/persistence/loader/data-model change.
