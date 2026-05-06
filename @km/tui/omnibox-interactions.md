---
mentions:
  - km
  - claude
id: "@km/tui/omnibox-interactions"
aliases:
  - km-tui.omnibox-interactions
  - km-tui-omnibox-interactions
created_by: Bjørn Stabell
created_at: 2026-04-14T23:25:25Z
closed_at: 2026-04-28T22:29:25Z
close_reason: Phase 7 ghost completion + Enter chord intents shipped. ghostFor
  pure derivation (case-insensitive, sigil-aware, top-candidate); UnifiedOmnibox
  renders ghost line under input with onAcceptGhost wired through connector.
  interpretEnter pure mapping for Shift/Ctrl/verb-letter chords
  (force-create-at, force-goto, force-verb). Sigil auto-replace and sticky
  memory already covered by Phase 5 (omnibox-state.test.ts). 21 unit tests + 4
  render tests, all green.
started_at: 2026-04-28T22:12:44Z
owner: bjorn@stabell.org
assignee: claude:2405c72e
dependencies:
  - issue_id: km-tui.omnibox-interactions
    depends_on_id: km-tui.omnibox-cursor
    type: blocks
    created_at: 2026-04-14T16:26:18Z
    created_by: Bjørn Stabell
    metadata: "{}"
  - issue_id: km-tui.omnibox-interactions
    depends_on_id: km-tui.omnibox-unified
    type: parent-child
    created_at: 2026-04-14T16:25:25Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: km-tui.omnibox-cursor
      - type: link
        target: km-tui.omnibox-unified
---

# [x] Interaction polish — sigil auto-replace, sticky memory, ghost accept, modifier chords (Phase 7) @km/tui #feature #P1 @claude:2405c72e

blocks:: [[@km/tui/omnibox-cursor]], [[@km/tui/omnibox-unified]]

Phase 7: add the full UX polish over the Phase 5 single-buffer foundation.

Covers four orthogonal behaviors — each row in the test matrix below is a journey test.

## 1. Sigil auto-replace (asymmetric)

- buffer=':cr' + user types '@' → buffer becomes '@cr' (colon is slippery)
- buffer=':cr' + user types 'a' → buffer becomes ':cra' (letter, no replace)
- buffer='@del' + user types '#' → buffer becomes '@del#' (at-sign is sticky; # is literal)
- buffer='@del' + user types ':' → buffer becomes '@del:' (at-sign is sticky; : is literal)
- buffer='' + user types '@' → buffer becomes '@' (empty, becomes leading sigil)

## 2. Sticky memory (two-slot mutation)

- user arrows in ':'-mode over a command result → defaultCommand mutates, selectedArgument untouched
- user arrows in '@'-mode over a context result → selectedArgument mutates, defaultCommand untouched
- user picks ':create_at', switches to '@del', picks '@delei', Enter → runs create_at @delei
- switching sigils (via typing OR cmd-k/cmd-f) preserves the other slot
- CANCEL clears both sticky slots
- CONFIRM clears buffer (in pane form); also clears sticky slots

## 3. cmd-k / cmd-f context-sensitive toggle (while open)

- cmd-k when buffer != ':' → buffer becomes ':', selectedArgument preserved
- cmd-f when buffer != '' → buffer becomes '', defaultCommand preserved (its sticky pick stays)
- cmd-k when buffer == ':' → no-op (idempotent)
- cmd-f when buffer == '' → no-op
- cmd-k on a freshly-selected argument → opens action panel (commands filtered by when(selectedArgument))

## 4. Ghost completion + modifier chord shortcuts

- buffer=':ne' with ghost 'w-project' visible → Space/Tab/Right-Arrow accepts → buffer=':new-project'
- buffer=':zz' (no ghost) + Space → buffer=':zz ' (literal space)
- Enter with visible ghost → accepts then confirms
- Shift+Enter → force create_at(selectedArgument)
- Ctrl+Enter → force goto(selectedArgument)
- Ctrl+{g,m,a,l,c}+Enter → direct verb overrides

## 5. Edge cases (pro flagged these for testing)

- selectedArgument deleted from tree (via another pane) → next frame, reducer detects null and clears sticky
- result set changes under highlighted row → SelectList preserves logical selection via onHighlight callback
- backspace on bare ':' (or '/') → buffer becomes ''; layout promotes (if /); defaultCommand reverts to 'default'
- sticky state after confirm → in dialog form, both slots cleared on dismissal; in pane form, only buffer is
- disabled Enter (command requires arg, selectedArgument = null) → bell + footer shows disabled state

## 6. Finish CAPTURE op handler

Wire capture_inbox to read the current buffer as the new node's title when invoked from the omnibox without a selected argument.

Acceptance: each numbered section above is a test file with at least one journey test per row. The edge cases (section 5) specifically require reducer-level tests to avoid requiring full UI setup.

