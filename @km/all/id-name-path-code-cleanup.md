---
id: "@km/all/id-name-path-code-cleanup"
aliases:
  - km-all.id-name-path-code-cleanup
  - km-all-id-name-path-code-cleanup
created_by: claude:bjorns-2026-04-30
created_at: 2026-04-30T09:23:00Z
type: refactor
priority: P2
parent: "@km/all"
---

# id/name/path code cleanup — variables, functions, parameters use the right term @km/all #refactor #P2

Sweep the codebase for misnamed identifiers — places where a variable / function / parameter is named `id` but carries a path or name, or named `name` but carries a path. Per user: "include the id=>name cleanup in your work."

## Why

Per the path/name/id three-concept model (see `.claude/arch-decisions/2026-04-30-path-vs-ulid-as-sqlite-pkey.md`):
- **id** = ULID (opaque, stable, internal)
- **name** = path segment / slug (one node, one label)
- **path** = composition of names by walk (user-facing form)

Today's code conflates these in a few places — most visibly:
- `--id` CLI flag actually accepts a path-form value
- `bdIdToPathForm` (function name says "id"; the input is bd-form `km-beads.foo` and output is a path)
- `resolveShortId` (function "resolves a short id" but really resolves a path-or-id-or-alias)
- `frontmatter id:` field carries a path
- Many local variables named `id` that hold path-form strings

## Scope

**Code (variables, functions, parameters):**

```
rg -n "(\b|_)id\b" packages/km-beads/src/ apps/km-cli/src/commands/bd.ts \
  | grep -v "node\.id\|nodes\.id\|getNode\|<ulid>\|repo\.id" \
  | head -40
```

For each hit, judge: does the variable/function carry an id (ULID), a name (segment), or a path (composed)? Rename to match.

**CLI flag long-names (NOT removing — see below):**

- `--id <value>` flag → accept any resolvable form (path, ulid, bd-form). Keep the flag name for bd-compat (per user: "we should allow for --id and --parent" for compat). Internally, the flag handler should call the resolver and then use ids exclusively after resolution.
- `--parent <value>` → same.

Don't rename the FLAGS themselves — that breaks bd compat. Rename the INTERNAL handling:
- `const idArg = options.id` → `const refArg = options.id` (and resolve immediately)
- `function lookupById(repo, id)` → `function resolveRef(repo, ref)` if the input is path-or-ulid

**Function and module names:**

- `resolveShortId` → `resolveRef` (or `resolveBeadRef`) — the function resolves any reference form, not "short ids" specifically.
- `bdIdToPathForm` → `bdRefToPath` (or fold into `pathOf` from `@km/all/path-derivation-helper`).
- `bdIdToPathFormWithSlug` → `bdRefToPathWithSlug` or similar.
- `generateShortId` → `generateInternalId` or `mintBeadUlid`.

**Frontmatter field:**

Handled in `@km/beads/frontmatter-path-rename` — separate bead for the on-disk field rename.

## Rules of thumb

When choosing a variable name:

| Carries | Name it |
|---|---|
| ULID (matches `nodes.id`) | `id`, `nodeId`, `beadId`, `ulid` |
| Single segment / slug | `name`, `segment`, `slug` |
| Composed path (`@km/beads/foo`) | `path`, `nodePath`, `beadPath` |
| Anything-resolvable (path-or-id-or-alias) | `ref` |

Default to `ref` when a function accepts user input that could be any form. Resolve to an `id` ASAP and then use `id` internally.

## Acceptance

- `rg -n '\bid\b' packages/km-beads/src/ apps/km-cli/src/commands/bd.ts` shows that every match holds an actual id (ULID), or is a flag-accessor like `options.id` (bd-compat surface).
- New code in km-beads/, km-storage/ uses path/name/id correctly per the rules above.
- `resolveShortId` is renamed (probably to `resolveRef`) with a deprecated re-export for one transitional release.
- A short comment block at the top of `packages/km-beads/src/short-ids.ts` (or the renamed file) restates the path/name/id distinction.
- Tests still pass (no behavior change).

## Inline strip-regex migration (added 2026-04-30 from /big arch agent)

The most concrete win in this bead is migrating 6 sites that hand-roll `fs_path.replace(/^\.\//, "").replace(/\.md$/, "")` to use `pathOf()`:

- `packages/km-storage/src/testing/fake-repo.ts:81`
- `packages/km-storage/src/db/links.ts:128`
- `packages/km-storage/src/repo/move-with-refs.ts:287`
- `packages/km-storage/src/repo/repo.ts:1310`
- `apps/km-cli/src/commands/broken-links.ts:66`
- (one more — re-grep at implementation time)

Mechanical replace; ≤1 hr. Add a grep-gate or oxlint rule blocking reintroduction of the inline pattern.

## YAGNI verdict on Path/Name typed wrappers (added 2026-04-30 from /big)

Per arch-agent opinion in /big session 2026-04-30 (high confidence): **do NOT add `Path`, `Name`, `NodeRef`, `PathBuilder`, `PathDelta`, `PathScope`, `PathPattern`, `PathSegment`, `MaterializedPath`, `AliasIndex`, `Resolver` unifying interface, or other typed wrappers.**

Rationale:
- Three concepts (id, name, path) are already modeled — id and name as KNode fields, path as the derivation `pathOf` consolidates.
- Per `docs/principles.md` Plain Domain Language: "the system's quality scales with the richness of a few core domain objects — not the number of ad-hoc helpers."
- Per `docs/principles.md` Domain Object Inventory: KNode/KTree/Position are the load-bearing namespaces; new operations should join them, not spawn parallel ones.
- KLink/KLinkRef justifies its weight via URI grammar (scheme + anchors + percent-encoding); paths in km don't have that complexity — they're `name`-segment chains with a sigil rule and `.md` extension. Two regexes, not a value object.
- `NameIndex` (`packages/km-core/src/klink-resolver.ts:19`) uses bare strings as keys — the codebase has actively voted against branded `Name`/`Path` types at the load-bearing layer.
- Hypothesis 17 ("mirror node:path") is already partially shipped: `packages/km-fs-mount/src/fs/path-utils.ts` owns `toRelativeFsPath`, `toAbsoluteFsPath`, `findKmRootFromPath`, `resolveFsPath`. Don't duplicate.

If a future session asks the same question, point them at this bead's verdict + the /big retro at `.claude/arch-decisions/2026-04-30-path-vs-ulid-as-sqlite-pkey.md`.

## Pairs with

- `@km/tree/ktree-path-method` (P2, NEW) — adds `KTree.path(tree, id)` to the canonical namespace; the second of the two real wins from the /big session.

## Out of scope

- Frontmatter field rename (`id:` → `path:`) — see `@km/beads/frontmatter-path-rename`.
- CLI flag rename — keep `--id` / `--parent` for bd compat per user direction.
- `nodes.id` SQL column rename — this is correct as-is (it IS the id).
- Doc updates — see `@km/all/storage-doc-three-concepts`.
- Adding `Path` / `Name` / `NodeRef` typed wrappers — explicitly rejected (see YAGNI verdict above).

## Long-horizon note

Per user: "eventually we will likely migrate to the task system instead of bd". When that lands, the bd-compat flag surface (`--id`, `--parent`) becomes removable. This cleanup leaves the *internal* code naming clean so the future migration is just dropping the bd-compat layer, not also untangling vocabulary.

## Related

- Origin: `.claude/arch-decisions/2026-04-30-path-vs-ulid-as-sqlite-pkey.md`.
- Pairs with: `@km/all/storage-doc-three-concepts` (docs side of the same vocabulary discipline).
