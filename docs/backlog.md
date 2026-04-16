# km Backlog

Ordered by priority. Position is priority — top = next. Move the line to re-prioritize. No P-values on new beads; rank lives here.

Related:
- Silvery version roadmap (v0.5, v1.0, v1.5, v2.0, v3.0) lives in [`vendor/internal/silvery/horizons.md`](../vendor/internal/silvery/horizons.md). Don't duplicate — link.
- Bead details: `bd show <id>`.

## Now

1. **W1 — Storage: links + sigils** — [`km-storage.link-model-canonical`](../.beads) + [`km-storage.sigils`](../.beads). Unified KLink type, 3-column `links` cache, strict sigil namespaces. Canonical doc: [`docs/design/links.md`](design/links.md). Mini-MECE sweep on 8 link/sigil docs at the end.

## Queued

2. **W2 — Full-tree docs MECE review** — `km-all.docs-mece-review`. One canonical source per concept; concept-ownership map in `docs/dev/doc-map.md`; glossary reconciled; retired docs archived.
3. **W3 — Omnibox v1 finish** — ship gate: `km-tui.omnibox-dialog`. Phases 2–5: ranker, command projection, when-predicate, unified dialog. In-flight: `km-tui.omnibox-quality-plateau` (legacy-dialog deletion).
4. **W4 — TEA in silvery + aichat showcase** — `km-silvery.tea`, new `km-silvery.aichat-showcase`, new `km-silvery.version-0.18-unify`. Dogfood TEA on silvery via aichat (coding-assistant showcase). End: silvery 0.18.0 unified lockstep release; `@silvery/ag-react` public.
5. **W5 — Theme system + aichat polish** — new `km-silvery.theme-mature`, new `km-silvery.aichat-polish`. Semantic tokens, typography presets, opencode visual parity.
6. **W6 — TEA in km + polish** — `km-tui.tea`, new `km-tui.theme-upgrade`, new `km-tui.polish-against-showcase`. Adopt silvery's matured TEA + theme. Includes internal refactor of omnibox v1 (shipped in W3) onto TEA `apply()`.
7. **W7 — Selection system** — `km-all.unified-selection`, `km-tui.sel-migration`. Ships on mature TEA so `apply()` chain is atomic across tree + selection. Downstream: `km-all.atomic-tree-ops` unblocks.

## Parallel (unblocked — pick up when blocked on Now)

- `km-tui.omnibox-quality-plateau` — in-flight legacy-dialog deletion.
- `km-silvery.selection-focus-plateau` — focus-scope plateau.

## Not committed (future work, seen but not scheduled)

- Silvery 1.0 stability contract (see `vendor/internal/silvery/horizons.md`).
- Cross-vault federation (`km://<vault>/...`).
- Backlinks panel + `to_id` cache.
- Property links / typed `rel` predicates.
- Universal editor (browser + terminal).
- LLM-powered backlink and timeline enrichment (`km-l98bq`).

## Cross-cutting policy

- `km-all.surface-freeze` — open throughout W1–W7. Lifts when **W3 (`km-tui.omnibox-dialog`) ships AND W7 (`km-all.unified-selection`) closes**. During freeze: no new view modes, no new node types. Sigils land in W1 (not frozen — planned capability).
- **Bug rule.** Encountered bugs: fix inline if scoped (< ~1h); otherwise bead-and-schedule for the relevant future phase. Never stall a workstream narrative for a single bug.
- **No P-values on new beads.** Existing P-values stay as historical data; ordering is the backlog position.

## Done

_(Dated list, newest first — entries move here as phases ship.)_
