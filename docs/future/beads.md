# km bd — Beads Replacement

> **Status: cutover in progress.** Tracking bead `@km/beads/cutover`. Today: parser fixed (commit `f7f3a9fcd`), migration produces 479 valid markdown files. Remaining work tracked under `@km/beads/*`.

km replaces `bd` (the Go CLI) with `km bd`, a beads-compatible CLI built on km's own storage. The shape is "issues are markdown nodes" — same primitive as everything else km manages. This doc captures the target design; the shipped subset is noted inline.

---

## Identity

Issues are addressed by **`@<prefix>/<scope>/<slug>`**, where `<prefix>` is the bd issue prefix from `.km/config.yaml` (per-repo, never hardcoded).

- This repo: prefix = `km` → `@km/storage/lazy-hydration`
- Sister repo `~/Code/pim/cloudi/`: prefix = `cloudi` → `@cloudi/...`
- `~/Code/pim/pam/`: would be `@pam/...`
- Multi-repo aggregation distinguishes natively (`@km/...` alongside `@cloudi/...`)

**Inline wikilinks within content drop the `@`**: `[[km/storage/lazy-hydration]]`. The `@` is a render-mode hint ("show this node as a board card / kanban view"), the path is the canonical name.

**Legacy bd-form ids** (`km-storage.lazy-hydration`, `km-storage-lazy-hydration`, `km-flexx-diag-passes`) keep working via two mechanisms:

1. **Per-issue `aliases:` frontmatter** (Obsidian-standard) — authoritative exact-match resolution for irregular cases. Generated automatically by `km bd migrate` for every imported issue.
2. **Import-time rewrite** — prose mentions of `<prefix>-<scope>.<slug>` become `@<prefix>/<scope>/<slug>` once at migration time (`rewriteLegacyIdMentions` in `migrate.ts`). No runtime regex scanning needed; aliases catch what slips through.

---

## Hierarchy

The filesystem path **is** the parent edge. There is no separate `parent_id` field; parent is derived from path.

```
issue/
└── silvercode/
    ├── acp.md                                ← the epic itself
    └── acp/                                  ← children live in the folder
        ├── rename.md                         ← @km/silvercode/acp/rename
        ├── session-prompt.md
        ├── session-update-list.md
        ├── tool-call.md
        └── usage-and-permission.md
```

Empirically (4642 live issues): 903 have a parent-child link, **0 have multiple parents**. The parent relation is already a strict tree, so path-as-parent is lossless.

**Why this works**:
- Tree-parent = path-parent = filesystem-parent. One source of truth.
- Moving an issue under a new parent is `git mv`. Rename re-resolution (already in klink) handles links.
- Scope queries become tree traversal: `@km/silvercode/...` = descendants of `silvercode/`.
- Scope epics like `silvercode` are folders that happen to have a sibling `.md` describing the initiative.

---

## Cross-graph relations

What can't fit in the name (because it's a graph, not a tree) lives as **multi-value inline-property wikilinks** on the source side:

```markdown
# silvercode component renames @issue #feature #P1

blocks:: [[../session-prompt]], [[../session-update-list]], [[../tool-call]], [[../usage-and-permission]]
```

Empirical fan-out (live data): 160 issues have any blocker, 26 have multiple, max is 10. Single-line wikilink syntax handles 1 to a dozen without ceremony.

Relation taxonomy (from the existing klink design):

- `blocks::` / `blocked-by::` — gating; one is auto-derived from the other via the `links` table reverse-lookup
- `related::` — soft connection
- `supersedes::` / `superseded-by::` — replacement (3 issues use this in current data)
- `parent::` — kept as escape hatch for the rare case where an issue legitimately wants a parent it doesn't live under (none in current data — most likely unused after migration)

---

## Frontmatter

```yaml
---
id: silvercode/acp/rename
aliases:
  - km-silvercode.acp-rename       # bd-flavor dotted
  - km-silvercode-acp-rename       # bd-flavor multi-dash (rare)
created_at: 2026-04-16T08:30:00Z
closed_at: 2026-04-22T14:12:00Z
---
```

- **`id:`** — Dendron-style stable identity. Path-shaped; survives content edits.
- **`aliases:`** — Obsidian-style list of alternate names. Resolver indexes alongside `id`. Catches: legacy bd-form ids during cutover, future renames.
- Together they cover everything bd's flat-string ids did, with no third standard field needed.

---

## Sigils

Per `klink.md`, sigils (`@`, `+`, `#`) are name-prefixes. The same primitive carries multiple "domains" of nodes, distinguished by sigil:

- **`@<prefix>/...`** — issues (`@km/storage/lazy-hydration`, `@cloudi/...`)
- **`@mem/<slug>`** — memories (replaces `bd remember`); content is the insight, sectioned for paragraph-sized entries
- **`@<Person>`** — people (existing convention)
- **`#<tag>`** — tags (existing convention)
- **`+<project>`** — projects (existing convention)

The `@` sigil is a render-mode hint. When a wikilink resolves to a sigil-prefixed name, the renderer shows it as a card (board view) rather than as inline prose.

---

## Memories

Replace `bd remember` with `@mem`-tagged sections in `mem/` (or `memory/`).

```markdown
## Dolt sync fix @memory
id:: km-mem.dolt-sync-fix

After "cannot merge with uncommitted changes" errors:

  bd dolt stop && bd dolt start

If a conflict is detected, resolve via SQL: …

## Upstream workaround tracking @memory
id:: km-mem.upstream-tracking

When our code gets a workaround for an upstream bug, file a bead under
`@km/all/upstream-waiting` …
```

`km bd prime` becomes "concatenate descendants of `mem/` matching `@memory`, format as sections, prepend to context" — same query primitive used everywhere.

Memories sit under their own root, *not* under `@<prefix>/`. They're not project-scoped issues — they're cross-cutting context.

---

## Status mapping

| bd status      | km task status    | marker |
|----------------|-------------------|--------|
| `open`         | `todo`            | `[ ]`  |
| `in_progress`  | `wip`             | `[/]`  |
| `closed`       | `done`            | `[x]`  |
| `blocked`      | `blocked`         | `[!]`  |
| `dropped`      | `dropped`         | `[-]`  |
| `deferred`     | (no equivalent)   | —      |

The `deferred` gap is small (18 issues in current data) and resolvable later — either add `deferred` as a km status or fold into `todo` with an inline `defer-until::` property.

---

## CLI

```bash
km bd ready                     # ready issues (todo, no unresolved blocked-by)
km bd list [filters]            # list with filters
km bd show <id>                 # detail view
km bd create "title" [opts]     # new issue
km bd update <id> [opts]        # update fields
km bd close <id> [-r reason]    # close
km bd drop <id> [-r reason]     # won't do
km bd dep add|remove|list       # dependency management
km bd blocked                   # all blocked issues
km bd stale [--days N]          # not-recently-updated
km bd remember "x" --key foo    # store memory at @mem/foo
km bd memories [search]         # list/search memories
km bd prime                     # emit memories + ready snapshot for hook injection
km bd migrate                   # one-shot import from .beads/issues.jsonl
```

Ids accept both canonical and legacy forms: `km bd show @km/storage/lazy-hydration` and `km bd show km-storage.lazy-hydration` both resolve.

---

## Migration

`km bd migrate` reads `.beads/issues.jsonl` (refreshed via `bd export`) and emits one .md file per issue under the configured `Parent:` directory.

Current state — structural cutover infrastructure shipped:

- **Parser** (`packages/km-beads/src/schema.ts`) handles bd v1.0 export shape: numeric priority, `dependencies` array, `_type: "memory"` records parsed into a typed stream. 4666/4666 issues + 3/3 memories parse, 0 errors.
- **Path-form filenames + aliases** (`bdIdToPathForm` / `bdIdToAliases`): `km-silvercode.acp-rename` → `silvercode/acp-rename.md` with frontmatter `id: silvercode/acp-rename` + `aliases: [km-silvercode.acp-rename, km-silvercode-acp-rename]`. Sub-issues with deeper dot-form (`km-silvery.backdrop-hardening.slim-barrel`) nest correctly. Auto-id beads (`km-q5hji`) park under `_orphan/`.
- **Cross-graph relations** — bd v1.0 `dependencies[]` translates to `blocks::` / `blocked-by::` / `related::` Logseq-style multi-value wikilink lines emitted at the top of the body. Targets are absolute path-form (`[[silvery/backdrop-hardening]]`) so they resolve regardless of host file location.
- **Memories** (`bd remember`, `bd memories`, `bd prime`) write to `mem/<key>.md` with a single `## <Title> @memory` section. Migration writes the same shape, so memories survive the bd→km bd cutover round-trip.
- **Legacy autolinks** rewritten *at import* (`rewriteLegacyIdMentions`) — bd-form ids in prose become `@<prefix>/<path-form>` once at migration time, not at every render. Skips matches inside existing wikilinks or inline code.
- **Resolver** (`resolveShortId` in `short-ids.ts`) tries three forms in order: canonical path-form `data.id` → legacy `data.short_id` → frontmatter `aliases[]`. Sigil-prefixed input (`@km/silvercode/acp/rename`) is normalized to canonical path-form before lookup.
- **Configurable prefix** — runtime new beads pull `beads.prefix` from `.km/config.yaml`; migration pulls `issue-prefix` from the source vault's `.beads/config.yaml` (or `--source <dir>` override). No hardcoded `"km"` in source.

Remaining cutover work (last mile):

- **`@km/beads/pm-skill-rewrite`** — `.claude/skills/pm/` and CLAUDE.md examples switch from `bd` to `km bd`.
- **`@km/beads/hooks-rewrite`** — SessionStart hooks call `km bd prime` instead of `bd prime`; `bd dolt pull` becomes `git pull` (markdown is the source of truth).
- **`@km/beads/dolt-archive`** — once both forms agree, archive `.beads/` to `.beads.bak/` and remove the brew dep.

Resolution priority (canonical, served by `resolveShortId`):

1. `data.id` — frontmatter canonical path-form (`silvercode/acp/rename`)
2. `data.short_id` — legacy bd-form set on nodes that ship neither frontmatter `id` nor `aliases`
3. `data.aliases[]` — explicit alternate names (`km-silvercode.acp-rename`, `km-silvercode-acp-rename`)
4. Fallback: ULID-suffix match on the raw node id (`km-a1b2` → trailing 4 chars match)

Sigil-prefixed input (`@<prefix>/<path>`) is stripped to bare canonical path-form before lookup so `@km/silvercode/acp/rename` and `silvercode/acp/rename` both resolve to the same node.

---

## Discoverability — help docs are part of every change

Every `km bd` cutover bead includes a help-doc update. The mapping must be visible at the user's fingertips:

- `km bd --help` and every subcommand's `--help` text reflects the canonical id form (`@<prefix>/<scope>/<slug>`) in usage examples, with a one-line note that legacy `<prefix>-<scope>.<slug>` is accepted.
- `km bd info` calls out the active prefix (already does), the canonical and legacy id forms, and any auto-detected aliases.
- `km bd doctor` reports drift between filename, `id:` frontmatter, and `aliases:` entries.
- The CLI usage notes (currently emitted as the trailing "Note:" block by `km bd --help`) explicitly link to this design doc and the `aliases:` frontmatter convention.

A bead is not "done" until: code change ✓, test ✓, **AND** help text + relevant doc page reflect the new behavior. Aim is "user runs `km bd --help` once and sees the new mapping" — no oral-tradition knowledge.

Same applies to skill files (`.claude/skills/pm/SKILL.md`) and CLAUDE.md examples — they are docs the agent reads, so they're help docs by another name.

---

## Obsidian/Dendron compatibility

km is a strict superset of standard PKM-flavor markdown. An Obsidian or Dendron user opening the vault sees regular markdown with extra frontmatter; nothing is broken syntax to them.

Same:

- `/` path separator (Obsidian convention; Dendron's `.` is the outlier)
- `[[Note]]`, `[[Note|alias]]`, `![[Note]]`, `[[Note#Section]]`
- `aliases:` frontmatter (Obsidian)
- `id:` frontmatter (Dendron)

km-specific (additive, non-conflicting):

- `@<prefix>/...` sigil-board addressing (no conflict; Obsidian ignores unknown sigil patterns)
- Bidirectional `blocked-by::` derived from `blocks::` (Logseq-style inline-property semantics)
- Auto-derived board view of `@<prefix>/...` subtree

The bar: a vault written by km should open cleanly in Obsidian. If it doesn't, that's a bug in km, not a feature.

---

## See also

- `docs/design/model/klink.md` — link/sigil/anchor model (the substrate this builds on)
- `docs/design/model/kast.md` — markdown ↔ km-ast transforms
- `packages/km-beads/` — current implementation
- `.km/config.yaml` — per-repo prefix and board configuration
