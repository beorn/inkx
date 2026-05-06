---
mentions:
  - km
id: "@km/tui/omnibox-command-projection"
aliases:
  - km-tui.omnibox-command-projection
  - km-tui-omnibox-command-projection
created_by: Bjørn Stabell
created_at: 2026-04-14T23:24:23Z
closed_at: 2026-04-17T15:29:32Z
close_reason: >-
  Option A — original spec superseded by implementation.


  Spec called for projectCommands() → KNode[] with type:'command'. That shape is
  incompatible with KNode (BlockType has no 'command' member; KNode requires
  parent_id/parent_idx/created_at/data/version that a registry entry has no
  honest value for). The single-owner principle — the stated point of the phase
  — is preserved via commandToRow
  (apps/km-tui/src/views/omnibox-row-adapters.ts) as the sole command→row
  adapter, invoked from projectCommands
  (apps/km-tui/src/state/omnibox-projection.ts), with OmniboxRowData as the
  unified row shape consumed by both commands and nodes.


  Evidence:

  - commandToRow is the only CommandDef → row adapter; nodeToRow handles KNode →
  row in the same module.

  - projectCommands / commandResultsForOmnibox in omnibox-projection.ts own the
  filter (modes + when via isCommandAvailable) → rank → project pipeline.

  - Phase 4 when-predicate gate already integrated (Phase 8 ahead of schedule).

  - All 87 omnibox tests pass (bun vitest run apps/km-tui/tests/omnibox).

  - tsc clean (0 non-vendor errors).

  - Docstring in omnibox-projection.ts now explicitly documents the single-owner
  principle and the row-view-model rationale.


  Commit: 046d8cf47 docs(omnibox): document single-owner adapter principle
  (Phase 3).


  Downstream beads (km-tui.omnibox-dialog, km-tui.omnibox-ranker,
  km-tui.omnibox-query-syntax) can consume OmniboxRowData directly; the ranker
  bead's 'rankResults(parsedQuery, candidates: KNode[])' signature applies to
  node candidates, while commands rank via the existing rankCommands path — both
  terminate at OmniboxRowData for the dialog.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tui.omnibox-command-projection
    depends_on_id: km-silvery.selection-focus-plateau
    type: parent-child
    created_at: 2026-04-15T11:31:10Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery.selection-focus-plateau
---

# [x] Command-tree projection (TEA shim, Phase 3) @km/tui #task #P1

blocks:: [[@km/silvery/selection-focus-plateau]]

Phase 3 TEA shim: single-owner command → row adapter for the unified omnibox.

## Shape (corrected from original spec)

Original spec called for projectCommands() → KNode[] with type:'command'.
This was revised during implementation: KNode's type union is BlockType ('p'|'h'|'code'|'quote'|'table'|'hr'|'html'|'math') — there is no 'command' member, and KNode requires structural fields (parent_id, parent_idx, created_at, updated_at, data, version) that a registry entry has no honest value for. Forcing commands into a KNode envelope would fabricate fields the rest of the system would then have to ignore.

The single-owner principle is preserved with a corrected shape:

- commandToRow (apps/@km/tui/src/views/omnibox-row-adapters.ts) is the ONE adapter that converts a CommandDef into a row descriptor (OmniboxRowData).
- projectCommands (apps/@km/tui/src/state/omnibox-projection.ts) is the ONE module that invokes commandToRow and owns the filter → rank → project pipeline via commandResultsForOmnibox.
- nodeToRow in the same adapters module handles KNode → row, so commands and nodes flow through one unified row shape (OmniboxRowData).
- When TEA lands, projectCommands retargets at app.commands.* without any consumer change.

## TEA-shim boundary

Exactly ONE module owns the projection. The row renderer (OmniboxRow), the ranker (rankCommands; future shared rankResults per @km/tui/omnibox-ranker), and the query-syntax parser (@km/tui/omnibox-query-syntax) all read the registry through this adapter — no consumer hardcodes a CommandDef import for display.

## Acceptance (as shipped)

(a) projectCommands(cmds) returns OmniboxRowData[] with stable ids matching 'cmd:' + CommandDef.id — via commandToRow.
(b) Every registered CommandDef flows through the adapter (all 200+ commands; tests in apps/@km/tui/tests/omnibox/*.test.ts exercise the pipeline).
(c) Secondary metadata surfaces correctly: keybinding hint, description (context), category (fallback hint) — all via commandToRow opts.
(d) No consumer hardcodes CommandDef for display — grep verifies only omnibox-projection.ts and omnibox-row-adapters.ts import CommandDef for row conversion.
(e) Availability gate (Phase 4 when-predicate) composes through isCommandAvailable — both def.modes (coarse) and def.when (precise) filtered in filterAvailableCommands before projection.

The docstring in omnibox-projection.ts documents the single-owner principle and explains why OmniboxRowData (not KNode) is the correct unified shape.

