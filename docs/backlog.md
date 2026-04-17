# km Backlog

Ordered by priority. Position is priority — top = next. Move the line to re-prioritize. No P-values on new beads; rank lives here.

Related:
- Silvery version roadmap (v0.5, v1.0, v1.5, v2.0, v3.0) lives in [`vendor/internal/silvery/horizons.md`](../vendor/internal/silvery/horizons.md). Don't duplicate — link.
- Bead details: `bd show <id>`.

## Now

1. **W2 — Full-tree docs MECE review** — `km-all.docs-mece-review`. One canonical source per concept; concept-ownership map in `docs/dev/doc-map.md`; glossary reconciled; retired docs archived.

## Queued

2. **W3 — Omnibox v1 finish** — ship gate: `km-tui.omnibox-dialog`. Phases 2–5: ranker, command projection, when-predicate, unified dialog. In-flight: `km-tui.omnibox-quality-plateau` (legacy-dialog deletion).
3. **W4 — TEA in silvery + aichat showcase** — `km-silvery.tea`, new `km-silvery.aichat-showcase`, new `km-silvery.version-0.18-unify`. Dogfood TEA on silvery via aichat (coding-assistant showcase). End: silvery 0.18.0 unified lockstep release; `@silvery/ag-react` public.
4. **W5 — Theme system + aichat polish** — new `km-silvery.theme-mature`, new `km-silvery.aichat-polish`. Semantic tokens, typography presets, opencode visual parity.
5. **W6 — TEA in km + polish** — `km-tui.tea`, new `km-tui.theme-upgrade`, new `km-tui.polish-against-showcase`. Adopt silvery's matured TEA + theme. Includes internal refactor of omnibox v1 (shipped in W3) onto TEA `apply()`.
6. **W7 — Selection system** — `km-all.unified-selection`, `km-tui.sel-migration`. Ships on mature TEA so `apply()` chain is atomic across tree + selection. Downstream: `km-all.atomic-tree-ops` unblocks.

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

- **2026-04-16 — W1 Storage: links + sigils shipped** — `km-storage.link-model-canonical` closed. Unified KLink type in `@km/core`, 3-column `links(host_id, href, rel)` cache with DATA_VERSION transparent rebuild, sigil-as-name design (no config file), letter-after-sigil parser rule, RFC 3986 percent-encoding, self-ref via bare `#Section`. 7 phases in 13 commits + 2 parallel worktree merges. Completeness audit followed `/refactor` 7-layer sweep: Data ✓ Types ✓ Functions ✓ Files ✓ Comments (migration history, legit) ✓ Docs ✓ Tests ✓. Post-audit cleanup: `EmbeddedUpdate.target_id` → `.embed_of` (terminological leak from internal type).
    - **Impact**: -575 net LOC across storage (Phase 3 alone); 80 new unit tests + 8 parser href tests; 6583 total passing / 37 skipped / 0 failing.
    - **Went well**: parallel worktree agents for Phase 3 (storage code) and Phase 6 (docs) — zero file conflicts because scopes cleanly separated (`docs/design/links.md` off-limits to both).
    - **Didn't go well**: Phase 3 agent committed to `main` directly instead of its worktree branch (unusual but landed correctly). Migration-path ambiguity about `embed_of` materialization resolved mid-flight (pragmatic choice: keep column, populate from links table in handlers).
    - **Worth it**: yes — name-based resolution at runtime replaces cache-based resolution; new code is simpler and less prone to staleness bugs.
