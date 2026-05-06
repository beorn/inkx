---
topic: "bead fs hierarchy"
date: 2026-05-06
arch_agent_report: "Adopt file.md + file/subitem.md; reject YAML parent_id as a second hierarchy source."
verdict: "ADOPTED"
---

# Arch retro — bead fs hierarchy

## Bundle path

`/tmp/arch-bead-fs-hierarchy.md`

## Canonical docs the lead read

- `docs/architecture.md:39-45` — KNode structural parent fields and universal node model.
- `docs/architecture.md:150-160` — filesystem `.md` files as source of truth in the layer stack.
- `docs/design/model/storage.md:779-803` — id/name/path distinction; DB references use ids.
- `docs/design/model/storage.md:804-815` — tree model vs filesystem materialization vocabulary.
- `docs/design/model/storage.md:865-874` — `fs_path` as canonical cache of OS-owned file paths.
- `docs/design/model/storage.md:911-915` — resolver supports `index.md` as fallback, not bead canonical shape.
- `docs/lessons/structural-visual-physical.md:5-15` — structural vs physical layer split.
- `docs/lessons/structural-visual-physical.md:66-79` — physical origin belongs in storage/parser.

## Close reasons read

- `@km/beads/children-path-prefix` — path-form sub-issues live in sibling folder `acp/`.
- `@km/beads/parent-id-leaf-materializes-inline` — `bd create --parent ... --id ...` materializes sibling files, not inline children.
- `@km/beads/data-id-stop-writing` — resolver no longer reads duplicated `data.id`.
- `@km/beads/frontmatter-path-rename` — file location is canonical path-form; no YAML `id:` or `path:`.
- `@km/all/path-name-id-redesign` — three-concept id/name/path model is live.

## Decision

Markdown-file bead hierarchy uses the existing sibling-directory filesystem shape:

```text
parent.md
parent/
  child.md
```

YAML `parent_id:` is not an authored hierarchy representation for bead files. If a bead is parented under another bead, the file moves into the parent's sibling directory. `bd children` reads immediate child bead files by `fs_path` prefix under that directory.

`item/index.md` remains resolver-supported infrastructure, not the bead canonical shape. Migrating beads to index files would be a separate architecture change with migration cost and no current evidence of benefit.

## Follow-up

Legacy/imported YAML `parent_id:` conflict behavior is still not specified. Bias: diagnostics may warn, but hierarchy commands should not read it as a parent-child source.
