---
mentions:
  - km
id: "@km/beads/directory-nesting-bd-create"
aliases:
  - km-beads.directory-nesting-bd-create
  - km-beads-directory-nesting-bd-create
created_by: claude:bjorns-2026-04-30
created_at: 2026-04-30T09:22:00Z
type: feature
priority: P1
parent: "@km/beads"
---

# bd create with path-positional arg + directory-nested parent inference @km/beads #task #P1

`bd create @km/beads/foo` infers the parent (`@km/beads`) from the leading segments of the path, walks to find its id, mints a new id for the new bead, sets `parent_id = <found>`, `name = "foo"`, and INSERTs. No `--id` or `--parent` flags needed user-facing.

Also: rename CLI surface to use path consistently — `--id` / `--parent` semantics drop in favor of path-positional args. (See "CLI surface" section below.)

## CLI surface (after this change)

Path-positional is the canonical km usage:

```bash
bd create @km/beads/foo --title "Foo bead" --type feature --priority P1
bd show   @km/beads/foo
bd close  @km/beads/foo --reason "shipped in <sha>"
bd move   @km/beads/foo @km/storage/foo                 # rename = move within tree
bd update @km/beads/foo --priority P0
bd link   @km/beads/foo @km/beads/bar --rel blocked-by
bd list   --parent @km/beads                            # parent flag fine for queries; resolves via name-walk
bd ready                                                # no path needed
```

**bd compat — keep `--id` / `--parent` flags accepting path or ulid input** (not removed). Per user (2026-04-30):

> "since we're aiming to be compatible with 'bd' we should allow for --id and --parent - but we should not encourage using it for ourselves"
> "we should just use the path"

So:

- `--id` and `--parent` flags continue to work; they accept any resolvable form (path, ulid, legacy bd-form).
- km's own docs, examples, snippets, scripts, and changelog text use path-positional only.
- The flags are kept for users transitioning from upstream `bd` and for any external scripts that already use them.
- **Long-horizon (per user)**: "eventually we will likely migrate to the task system instead of bd" — the bd-compat flag surface is transitional. When km ships its native task system, this compat layer becomes deletable.

## Implementation

1. Parse positional path arg (e.g. `@km/beads/foo`). Strip leading sigil/prefix to get a tree path: `["@km", "beads", "foo"]`. The leading `@<prefix>` segment matches the repo's root sigil.
2. Walk root by name to find parent: `(root) → "@km" → "beads"`. Each step uses `(parent_id, name)` lookup. Last segment (`"foo"`) is the new node's name.
3. Mint a fresh ULID for the new bead.
4. INSERT row: `id = <ulid>`, `parent_id = <found-parent-id>`, `name = "foo"`, `type = "h"`, `item = {}` (for bead-shaped item), plus the standard frontmatter fields from flags (`--title`, `--type`, `--priority`).
5. Frontmatter `id:` field write: SKIP (no longer needed; path is derivable). See related bead `@km/beads/data-id-stop-writing`.
6. File location on disk: `@km/beads/foo.md` (mirrors the path naturally).

## Edge cases

- Leading segment doesn't match repo prefix → error: "path must start with `@<prefix>/` for this repo (`<actual-prefix>`)."
- Intermediate segment not found → error: "parent path `@km/beads` doesn't exist; create it first or use `--create-parents`." (Defer `--create-parents` to a follow-up; reject by default.)
- Final segment collides with existing sibling → error: "name `foo` already exists under `@km/beads`." (Caught by `UNIQUE (parent_id, name)` — surfaces as a clean error message, not a SQL constraint dump.)
- Path with no slug, just scope (e.g. `bd create @km/beads`) → error or interactive prompt; don't silently create a `name = ""` row.

## Depends on

- `@km/beads/resolver-path-via-name-walk` (now reframed as "delegate to resolveNode") — used to look up the parent path.

(Original draft listed `@km/storage/parent-name-unique` as a dependency; that bead was dropped — fs_path uniqueness is enforced by the OS filesystem, no DB-level UNIQUE needed. Collision detection on `bd create` happens via `pathExists`-style check before insert, not via a SQL constraint.)

## Acceptance

- `bd create @km/beads/foo --title "Foo"` creates the bead under `@km/beads`, with `name = "foo"` and a fresh ULID id.
- `bd show @km/beads/foo` returns it.
- `bd create @km/beads/foo` again → fails with a clear "name already exists" error.
- `bd create @km/nonexistent/foo` → fails with "parent path doesn't exist".
- `apps/km-cli/tests/bd-create.test.ts` covers the happy path + 3 error cases.
- All existing CLI commands take path-positional args; `--id`/`--parent` flags removed (or aliased through `--path` for one transitional release).

## Related

- Origin: agenda item #4 from the suggested next-session list (2026-04-30 morning), unblocked by `.claude/arch-decisions/2026-04-30-path-vs-ulid-as-sqlite-pkey.md`.
- Prior commit: `e102fd751 docs(pm,beads): canonicalize path-positional bead-command idiom` already documented the direction; this bead is the implementation.

