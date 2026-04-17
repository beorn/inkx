# Documentation Map

_The canonical-source-per-concept map. Read this before proposing a new doc or editing an existing one. Last full audit: 2026-04-16 (W2 of the backlog)._

Every concept in km has exactly one canonical doc. Overviews, references, and guides **link** to the canonical, they do not redefine. When terminology drifts, this file helps track where the drift is.

## Doc roles

| Role | Purpose | Edit discipline |
|---|---|---|
| **canonical** | Owns one or more concepts. Authoritative definition lives here. | Update in place. Bump the "last verified" date. |
| **overview** | Surveys multiple concepts without owning any. | Point at canonicals. No redefining. |
| **reference** | Lookup table or API docs. | Mechanical. Regenerate if derived. |
| **guide** | How-to for users or devs. | Keep aligned with canonical. |
| **lesson** | Retrospective / case study. | Frozen once written; move to archive if the pattern is retired. |

## Canonical sources — concept → doc

| Concept | Canonical doc |
|---|---|
| KNode record shape, items vs blocks, ItemData, visual roles, body content | [design/model/knode.md](../design/model/knode.md) |
| KLink, KLinkRef, KResolution, NameIndex, MdForm, sigil parsing, normalizeLinkHref, href encoding | [design/model/klink.md](../design/model/klink.md) |
| km-ast type system, block types, traits, derivation rules | [design/model/kast.md](../design/model/kast.md) |
| Visibility mechanisms (structural exclusion, collapsed columns, fold) | [design/ui/visibility.md](../design/ui/visibility.md) |
| Folder/file/H1 collapse rule, index file expansion, fstype classification | [design/ui/visibility.md](../design/ui/visibility.md) |
| Selection type, cursor/anchor, inputMode, 9 Selecting kinds | [design/ui/selection.md](../design/ui/selection.md) |
| TEA state machine pattern | [design/tea.md](../design/tea.md) |
| Navigation (cursor movement, grid nav, zoom) | [design/ui/navigation.md](../design/ui/navigation.md) |
| Node visual spec (rendering, embed expansion) | [design/ui/rendering.md](../design/ui/rendering.md) |
| Per-node reactive computeds | [design/ui/rendering.md](../design/ui/rendering.md) |
| Horizontal virtualization, sticky columns | [design/ui/layout.md](../design/ui/layout.md) |
| Outliner spec (indent, bullets, nesting) | [design/ui/layout.md](../design/ui/layout.md) |
| Theme tokens (km uses silvery's system) | [silvery.dev/guide/theming](https://silvery.dev/guide/theming) |
| Spatial navigation, focus scope | [design/visual-navigation.md](../design/visual-navigation.md) |
| Omnibox (command palette, fuzzy search) | [design/omnibox.md](../design/omnibox.md) |
| Tree aggregation, fold-depth | [design/ui/rendering.md](../design/ui/rendering.md) |
| Task recurrence (RRULE + FROM) | [design/recurrence.md](../design/recurrence.md) |
| Tribe multi-session coordination | [vendor/bearly/plugins/tribe/README.md](../../vendor/bearly/plugins/tribe/README.md) — owned by bearly |
| Storage modes (memory/disk), SQLite schema, ULIDs | [storage.md](../design/model/storage.md) |
| Query language (field:value, sigils, paths, FTS) | [guides/query.md](../guides/query.md) |
| Task fields (marker, status, due, priority, recur) + cross-system mapping | [ref/task-fields.md](../ref/task-fields.md) |
| Markdown format (GFM, wikilinks, embeds, task marks, sigils, properties, block refs) | [guides/markdown.md](../guides/markdown.md) |
| Keybindings (layers, chord system, v2) | [design/input.md](../design/input.md) |
| Command registry, when clauses | [ref/commands.md](../ref/commands.md) |
| Effect type catalog (TreeEffect + BoardEffect) | [ref/effects.md](../ref/effects.md) |
| Change type taxonomy (node_*, task_*, session_*) | [ref/changes.md](../ref/changes.md) |
| Tree glob patterns | [ref/tree-globs.md](../ref/tree-globs.md) |
| Terminology index (all terms A–Z) | [glossary.md](../glossary.md) |
| Test architecture (unit, integration, driver, system) | [dev/test-system.md](../dev/test-system.md) |

## Overview docs — what to expect

- [architecture.md](../architecture.md) — layer stack, data flows, top-level TreeLens pipeline. Points at canonicals for every concept.
- [concepts.md](../concepts.md) — user-facing "what km is". Short summaries + links.
- [principles.md](../principles.md) — design philosophy, code style, factories/DI/no classes.
- [packages.md](../packages.md) — package roster, dependencies, CLI.
- [README.md](../../README.md) — landing page, quick start, feature list.

## Retired — moved to archive

- `docs/keybindings.md` → [archive/keybindings-v1.md](../archive/keybindings-v1.md) — superseded by `design/input.md` (2026-04-16).
- `docs/ref-keybindings.md` → [archive/ref-keybindings.md](../archive/ref-keybindings.md) — duplicate of `design/input.md` at lower fidelity (2026-04-17).
- `docs/dev/ink-patterns.md` → [archive/ink-patterns-pre-silvery.md](../archive/ink-patterns-pre-silvery.md) — km migrated off Ink to silvery (2026-04-16).
- `docs/ref/inkx-vs-ink-deep-research-2026-02.md` → [archive/inkx-vs-ink-deep-research-2026-02.md](../archive/inkx-vs-ink-deep-research-2026-02.md) — dated research; decision stands (2026-04-16).
- `docs/future/inkx-*.md` (3 files) → [archive/](../archive/) — Ink is retired; speculative designs won't ship (2026-04-17).
- `docs/design/selection-landscape.md` → [archive/selection-landscape.md](../archive/selection-landscape.md) — research artifact, not active design (2026-04-17).
- `docs/design/theme-system-v2.md` → [archive/theme-system-v2.md](../archive/theme-system-v2.md) — theme is silvery's concern; see [silvery.dev/guide/theming](https://silvery.dev/guide/theming) (2026-04-17).
- `docs/design/render-neutral-tui.md` → [archive/render-neutral-tui.md](../archive/render-neutral-tui.md) — silvery owns multi-target rendering (2026-04-17).
- `docs/design/tribe.md` → [archive/tribe.md](../archive/tribe.md) — tribe is a bearly plugin; see [`vendor/bearly/plugins/tribe/`](../../vendor/bearly/plugins/tribe/) (2026-04-17).

## Deferred (orphans + backlog — see `docs/backlog.md`)

Concepts code uses heavily but docs don't fully own. Tracked for follow-up:

- **TreeMutator operations** (split, merge, indent, outdent, inverse, normalize) — brief in `architecture.md`, detailed per-operation doc missing.
- **Repo mutation API** (addNode, updateNode, moveNode, deleteNode + event semantics) — brief in `architecture.md`, detailed doc missing.
- ~~**Effect type catalog**~~ — closed 2026-04-17: canonical at [ref/effects.md](../ref/effects.md).
- ~~**Change type taxonomy**~~ — closed 2026-04-17: canonical at [ref/changes.md](../ref/changes.md).

## Resolved code renames (2026-04-17)

W2 flagged these as deferred; all shipped as part of the docs-grooming /complete follow-up.

- ~~`TreeLens.resolvedSymlink()` → `resolvedEmbed()`~~ — codebase already on `resolvedEmbed` (verified 0 legacy hits).
- ~~`ViewRole` → `ViewType`~~ — 11 files updated; type + all call sites.
- ~~`kmast/` dir → `kast/`~~ — directory + test file renamed; 6 import-path updates.

## How to use this file

- **Before editing a doc**: check the concept map. If the doc you're editing is not the canonical for the concept, fix the canonical instead.
- **Before creating a new doc**: check if the concept is already owned. If yes, update the owner. If no, add a row to the concept map here once the new doc lands.
- **When a canonical changes**: the overview docs that reference it should be checked for drift. Track these via `grep` for the concept name.
