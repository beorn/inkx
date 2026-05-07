---
mentions:
  - km
  - claude
id: "@km/logview/search-flow-broken"
aliases:
  - km-logview.search-flow-broken
  - km-logview-search-flow-broken
created_by: claude:c6244087
created_at: 2026-04-23T07:53:49Z
closed_at: 2026-04-23T08:05:06Z
close_reason: >-
  Fixed via 4 commits:


  - silvery 0621af86 — ListView's nav useInput now guards key.return against
  searchCtx.isActive, so Enter in the search bar no longer double-fires into
  ListView's onSelect → detail pane.

  - silvery 0b702202 — searchUpdate 'close' preserves matches (bar closes,
  results persist) so n/N can cycle after Escape; ListView's search registration
  now auto-generates an id via useId when no surfaceId is supplied (km-logview
  never set one — which is why matches were always 0).

  - silvery 561634b0 — ListView's Searchable.reveal routes through moveTo (→
  onCursor) in nav mode, so the App's cursor state tracks matches. In passive
  mode it still calls scrollToItem as before.

  - km e797824d7 — apps/km-logview/tests/search-flow.test.tsx covers all three:
  Enter-in-bar does not open detail, n/N cycle after close, cursor tracks
  matches on typing.


  Test delta: +3 new tests in km-logview (34→37, all green); silvery
  search/listview: 53 tests all green; no tsc regression (baseline 56).
owner: bjorn@stabell.org
assignee: claude:c6244087
dependencies:
  - issue_id: km-logview.search-flow-broken
    depends_on_id: km-logview
    type: parent-child
    created_at: 2026-04-23T00:54:13Z
    created_by: claude:c6244087
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-logview
---

# [x] km-logview /-search is cosmetic only: Enter→detail, n/N dead, cursor doesn't track matches @km/logview #bug #P1 @claude:c6244087

blocks:: [[@km/logview]]

Three interlocking problems make `/`-search cosmetic only (see task #13 report):

1. **Enter in search bar opens the detail pane.** `SearchBindings` treats `key.return` as 'next match' (without consuming), but `ListView` also sees `key.return` and fires its own `onSelect` → App's `setDetail(r)` → DetailPane. Visible: typing `/foo<Enter>` jumps into JSON detail.
2. **`n`/`N` at App level are dead keys.** App's `useInput` early-returns when `search.isActive`, so `n`/`N` only fire post-close. But `close` in `searchUpdate` resets state via `createSearchState()` (matches=[]), so `search.next()/prev()` has nothing to cycle. Consequence: the matches suffix in the status bar is never shown.
3. **Cursor doesn't track matches.** `SearchProvider` effects call `searchable.reveal(match)` → `scrollToItem(i)`, but in ListView nav mode `scrollTo` is overridden by `activeCursor` on the next render, so viewport snaps back to cursor. App's `cursor` state is never updated by search.

Fix shape: route search effects through App's `handleCursor`/`onCursor`, propagate match index into cursor state, gate ListView's Enter-consumption when search bar is active (or stop SearchBindings from treating key.return as next-match).

Spans @km/logview `App.tsx` + silvery `SearchProvider.tsx` + silvery `ListView.tsx`.

