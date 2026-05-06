---
mentions:
  - km
id: "@km/silvercode/autolinks-extraction"
aliases:
  - "@km/all/autolinks-extraction"
  - km-all.autolinks-extraction
  - km-all-autolinks-extraction
created_by: claude:2405c72e
created_at: 2026-04-25T15:43:59Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-all.autolinks-extraction
    depends_on_id: km-all
    type: parent-child
    created_at: 2026-04-25T08:44:18Z
    created_by: claude:2405c72e
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-all
---

# [ ] Extract smart-link infrastructure into shared package (silvercode + km + website) @km/all #epic #P3

blocks:: [[@km/all]]

## Context

Today silvercode has `apps/silvercode/src/autolinks/` (config loader, popover renderer, preview cache). km has its own storage-level link model at `docs/design/links.md`. The website (silvery.dev / km.dev) has a separate glossary-driven term-enrichment system.

These three systems will converge on shared infrastructure as silvercode integrates with km. Filing this as a tracking epic so we don't paint ourselves into a corner with `apps/silvercode/src/autolinks/` references that need to migrate later.

## Naming decision

| System                                                   | Standard name                     | Was                                  |
| -------------------------------------------------------- | --------------------------------- | ------------------------------------ |
| Pattern → URI → preview/action (display-layer detection) | smart links                       | autolinks                            |
| Glossary term → linkified <a> (build-time enrichment)    | glossary linker / term enrichment | autolinks                            |
| Storage-level link between knodes (data-layer)           | links (canonical Link type)       | unchanged — see docs/design/links.md |

Why "smart links":

- GitHub's "autolinks" is closest peer but ours is a superset (preview kinds, popovers, mouse).
- Apple/Slack vocabulary; pairs with "smart link providers" if plugin API.
- Distinct from website System B → no naming collision.

Why "glossary linker":

- Standard in docs-tooling (Sphinx, MkDocs, Hugo).
- Build-time vs run-time.

## Package shape (target end-state)

| Package                        | Owns                                                                                                                       |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| @km/links                      | Storage-level Link type, URI scheme registry, rel taxonomy, link cache fields. Already canonical.                          |
| @km/smartlinks (NEW)           | Smart-link config + URI dispatch + popover (display-layer). Consumed by silvercode + @km/tui.                              |
| @km/glossary (NEW)             | Build-time term enrichment for static content. Consumes @km/links URI scheme registry; doesn't need popover.               |
| @silvery/smartlinks (deferred) | If silvery exposes the popover primitive for any silvery app to use. Lift from @km/smartlinks if a third consumer appears. |

## Migration arc

1. **Now**: Smart-link work continues in `apps/silvercode/src/autolinks/` to ship features fast.
2. **After URI pivot lands** (`km-silvercode.autolinks-uri-pivot`): rename `autolinks/` → `smartlinks/` within silvercode. Update bead/file/doc references.
3. **When @km/tui adds a smart-link surface** (e.g., wikilinks-with-popovers in knode body view, OR silvercode-as-@km/_orphan/app integration): extract to `packages/km-smartlinks/`. Both apps consume.
4. **When website needs URI handlers**: factor URI handler registry into `@km/links`. `@km/glossary` consumes for output URLs; `@km/smartlinks` consumes for popover dispatch.

## Acceptance

- [ ] `apps/silvercode/src/autolinks/` renamed to `smartlinks/` — bead `km-silvercode.autolinks-uri-pivot` blocks this rename
- [ ] `packages/km-smartlinks/` exists, consumed by silvercode + at least one other app (@km/tui or web)
- [ ] `packages/km-glossary/` exists with the website's term-enrichment logic
- [ ] URI handler registry factored into `@km/links` (single source of truth for URI scheme dispatch)
- [ ] Doc updates: `docs/architecture.md`, `docs/design/links.md` mention smart-links + glossary as separate-but-related systems

## What this is NOT

- NOT a rewrite of any of the three systems — just extraction + naming.
- NOT scoped to silvercode-as-@km/_orphan/app integration — that's a separate question. This epic just makes that integration easier when it happens.
- NOT blocking. Smart-link work can keep shipping in `apps/silvercode/src/autolinks/` until we're ready.

## References

- `docs/design/links.md` — canonical storage-level Link model
- `apps/silvercode/src/autolinks/` — current smart-link implementation
- `km-silvercode.autolinks-uri-pivot` — prerequisite (URI dispatch factor)
- `km-silvercode.autolinks-mcp-resolver` — superseded by URI pivot (mcp becomes a handler scheme)
- Website glossary system — TBD location

