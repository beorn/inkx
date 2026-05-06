---
mentions:
  - km
id: "@km/tui/omnibox-dialog"
aliases:
  - km-tui.omnibox-dialog
  - km-tui-omnibox-dialog
created_by: Bjørn Stabell
created_at: 2026-04-14T23:24:57Z
closed_at: 2026-04-17T19:04:26Z
close_reason: "Shipped 2026-04-17 as W3 v1 ship. 11/12 acceptance criteria met:
  (a) openOmnibox+OmniboxPane; (b) cmd-k/cmd-f/:/shift-m/verb-chords route
  through openOmnibox; (c) manage_favorites scope = favorites only; (d)
  item_picker preserves scope; (f) no dialog:omnibox scope guards existed (N/A);
  (g) 11 journey tests in omnibox-chord-routing.test.ts; (h)
  search_replace+filter deferred; (i) default CommandDef shipped; (j) SelectList
  onHighlight navigation; (k) shift_up/down/left/right gated not(omniboxOpen);
  (l) multi-select disabled (SelectList single-select). (e) partial:
  FavoritesDialog deleted (196 LOC), ItemPicker kept — 3 live flows
  (SET_LABEL/SET_ASSIGNEE/PANE_SPLIT_AND_PICK) need command-level unification —
  tracked in km-tui.itempicker-unify. 747/747 omnibox tests pass. tsc 0. Key
  commits: cd7b96ba0 (tests), d639c8476 (reroute), b7e205cf5 (fix), de6e25bbc
  (shift gate), 3700d785c (FavoritesDialog delete)."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tui.omnibox-dialog
    depends_on_id: km-tui.omnibox-command-projection
    type: blocks
    created_at: 2026-04-14T16:26:16Z
    created_by: Bjørn Stabell
    metadata: "{}"
  - issue_id: km-tui.omnibox-dialog
    depends_on_id: km-tui.omnibox-default-command
    type: blocks
    created_at: 2026-04-14T18:17:14Z
    created_by: Bjørn Stabell
    metadata: "{}"
  - issue_id: km-tui.omnibox-dialog
    depends_on_id: km-tui.omnibox-query-syntax
    type: blocks
    created_at: 2026-04-14T16:26:17Z
    created_by: Bjørn Stabell
    metadata: "{}"
  - issue_id: km-tui.omnibox-dialog
    depends_on_id: km-tui.omnibox-ranker
    type: blocks
    created_at: 2026-04-14T16:26:15Z
    created_by: Bjørn Stabell
    metadata: "{}"
  - issue_id: km-tui.omnibox-dialog
    depends_on_id: km-tui.omnibox-recents
    type: blocks
    created_at: 2026-04-14T16:37:28Z
    created_by: Bjørn Stabell
    metadata: "{}"
  - issue_id: km-tui.omnibox-dialog
    depends_on_id: km-tui.omnibox-row
    type: blocks
    created_at: 2026-04-14T16:26:14Z
    created_by: Bjørn Stabell
    metadata: "{}"
  - issue_id: km-tui.omnibox-dialog
    depends_on_id: km-tui.omnibox-unified
    type: parent-child
    created_at: 2026-04-14T16:24:58Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: km-tui.omnibox-command-projection
      - type: link
        target: km-tui.omnibox-default-command
      - type: link
        target: km-tui.omnibox-query-syntax
      - type: link
        target: km-tui.omnibox-ranker
      - type: link
        target: km-tui.omnibox-recents
      - type: link
        target: km-tui.omnibox-row
      - type: link
        target: km-tui.omnibox-unified
---

# [x] Unified omnibox dialog component (Phase 5 — v1 ship) @km/tui #feature #P1

blocks:: [[@km/tui/omnibox-command-projection]], [[@km/tui/omnibox-default-command]], [[@km/tui/omnibox-query-syntax]], [[@km/tui/omnibox-ranker]], [[@km/tui/omnibox-recents]], [[@km/tui/omnibox-row]], [[@km/tui/omnibox-unified]]

V1 ship: unified Omnibox as a singleton overlay pane. State lives in workspace.overlayPane: OmniboxPane | null (with type: 'omnibox' and an OmniboxBaseState + OmniboxProps inside). The dialog renders above the normal pane layout; dismisses on OMNIBOX_CONFIRM or OMNIBOX_CANCEL.

## Component architecture

Three top-level components:

- DialogOmnibox (center overlay, ephemeral) — default
- FindOmnibox (bottom-left inline bar, ephemeral) — rendered as a delegate from DialogOmnibox when buffer.startsWith('/')
- PaneOmnibox (docked, persistent) — post-v1 (@km/tui/omnibox-pop-out)

All three share useOmniboxState() hook + reducer + OmniboxRow/SelectList/BufferInput/Footer primitives.

## Base state (3 fields)

interface OmniboxBaseState {
  buffer: string              // single sigil-routed buffer
  defaultCommand: string      // always set; 'default' is universal initial
  selectedArgument: KNode|null  // sticky non-':'-mode highlight
}

## Props (immutable per invocation)

interface OmniboxProps {
  initialBuffer: string
  initialDefaultCommand: string
  initialArgument: KNode | null
  candidates: KNode[] | (() => KNode[])  // caller pre-scopes
  anchorPaneId: string   // required — the source pane
  ephemeral: boolean
}

## Single-buffer model (Phase 5 only)

This phase ships the base mechanism: single buffer, leading-sigil routing, SelectList with onHighlight callback updating sticky slots. NO Tab, NO focus flag, NO commandBuffer/argumentBuffer split.

Phase 6 wires cursor unification via currentCursor(). Phase 7 (@km/tui/omnibox-interactions) adds sigil auto-replace, ghost completion, modifier chords, cmd-k/cmd-f context toggle.

## Rerouting existing commands

Route the 5 legacy dialog-opener commands through openOmnibox(...):

- command_palette → openOmnibox({ initialBuffer: ':', initialDefaultCommand: 'default', candidates: allNodes })
- item_picker → openOmnibox({ initialBuffer: '', initialDefaultCommand: 'default', candidates: allNodes })
- manage_favorites → openOmnibox({ initialBuffer: '', initialDefaultCommand: 'manage_favorites', candidates: favoritedNodes })
- search → openOmnibox({ initialBuffer: '', initialDefaultCommand: 'default', candidates: allNodes })
- local_find → openOmnibox({ initialBuffer: '/', initialDefaultCommand: 'local_find', candidates: currentViewVisibleNodes })

Legacy Omnibox.tsx / ItemPicker.tsx / FavoritesDialog.tsx become thin delegators (≤10 lines each).

V1 DEFERRALS: search_replace and filter stay on their current dialogs. Both need dedicated follow-up beads.

## Acceptance

(a) openOmnibox() creates workspace.overlayPane with type='omnibox' and an OmniboxPane containing OmniboxBaseState + props
(b) cmd-k, cmd-f, g@, m+, a#, l-g, c@, / chord paths all route through openOmnibox with correct initial state
(c) manage_favorites opens an omnibox whose candidates list is only favorited nodes (journey test asserts non-favorited nodes are NOT in the result list)
(d) item_picker opens an omnibox with the correct candidate scope preserved
(e) Legacy Omnibox/ItemPicker/FavoritesDialog become thin delegators (≤10 lines each) — this is asserted via line count in the cleanup bead
(f) dialog:omnibox scope guards in the command executor are feature-flagged for removal in cleanup
(g) journey test per chord path lands at the correct initial state
(h) search_replace and filter explicitly remain on their legacy dialogs (regression test)
(i) 'default' command registered and passes its own tests (@km/tui/omnibox-default-command)
(j) Pane navigation primitives (arrow, Ctrl+N/P, click-select) work via SelectList onHighlight
(k) shift commands are hidden in the omnibox via when: (ctx) => ctx.activePaneType !== 'omnibox'
(l) multi-select is globally disabled in v1 (single-select only via SelectList)

