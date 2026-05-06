---
mentions:
  - km
  - claude
id: "@km/silvery/input-structured-events"
aliases:
  - km-silvery.input-structured-events
  - km-silvery-input-structured-events
created_by: claude:019d032d
created_at: 2026-04-23T01:26:02Z
closed_at: 2026-04-23T02:18:42Z
close_reason: "Shipped. Phase A (silvery 85c7d387) + Phase B (018bd1e2 +
  82155eae) + km bump (288f379e6). ANSI parser relocated from term-provider into
  InputOwner; term.input.onKey/onMouse/onPaste/onFocus is the canonical
  subscription API; term.events/getState/subscribe/TermState deleted from public
  Term interface; term-provider.ts deleted entirely; createApp event loop
  subscribes directly via term.input.on* + watch(term.size.snapshot());
  emulator-backed Term gains a non-TTY InputOwner (sendInput fans out via
  input.sendKey/etc); useTerm + useWindowSize + compose migrated to term.size
  signals; isFullProvider accepts Term-shape (.size) OR legacy Provider
  (events/subscribe/getState). Verification: tsc 0 non-vendor errors; silvery
  feature+runtime sweep 1595/1602 (7 pre-existing fails unchanged); km-tui
  2511/2511. NOT PUSHED."
owner: bjorn@stabell.org
assignee: claude:019d032d
dependencies:
  - issue_id: km-silvery.input-structured-events
    depends_on_id: km-silvery.term-sub-owners
    type: parent-child
    created_at: 2026-04-22T18:26:31Z
    created_by: claude:019d032d
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery.term-sub-owners
---

# [x] Migrate ANSI event parsing into term.input; retire term.events() / TermState / term.subscribe @km/silvery #task #P1 @claude:019d032d

blocks:: [[@km/silvery/term-sub-owners]]

## Why

After the Phase A–D plateau push, the sub-owner surface is coherent but most consumers still read events from the legacy pre-subowner pipe (`term.events()` — an async generator) instead of subscribing through `term.input`. The ANSI parsing (key / mouse / paste / focus) lives inside `term-provider.events()` (packages/ag-term/src/runtime/term-provider.ts) rather than the Input owner. This is the biggest shape asymmetry remaining: the modern path (sub-owners) and the legacy path (events + TermState + subscribe) both work, and consumers default to the legacy one because that's what createApp reads.

## Scope

### Move the parser into Input

Relocate / expose from `term.input`:

- `term.input.onKey(handler: (key: Key) => void): () => void`
- `term.input.onMouse(handler: (event: ParsedMouse) => void): () => void`
- `term.input.onPaste(handler: (event: { text: string }) => void): () => void`
- `term.input.onFocus(handler: (event: { focused: boolean }) => void): () => void`

Internally: a single `stdin.on("data", onChunk)` that runs the same parser currently in `term-provider.events()` (splitRawInput, parseBracketedPaste, parseFocusEvent, isMouseSequence/parseMouseSequence, parseKey). Each parsed event fans out to the matching subscriber set. The cross-chunk incomplete-CSI buffer stays inside Input.

### Retire the legacy surface

Delete from the public `Term` interface:

- `events(): AsyncIterable<ProviderEvent<TermEvents>>`
- `getState(): TermState`
- `subscribe(listener: (state: TermState) => void): () => void`
- `TermState` type (if not used elsewhere internally)

### Migrate consumers

- `packages/ag-term/src/runtime/create-app.tsx` — replace the `termProvider.events()` → `providerEventStreams` merge with direct `term.input.on*` subscriptions. Event loop consumes from a local queue that the subscriptions feed.
- `packages/ag-term/src/runtime/term-provider.ts` — thin after this: it can either be deleted entirely or shrunk to just the legacy adapter path (non-Term-driven callers). Decide during implementation.
- `packages/ag-term/src/ansi/term.ts` — drop the `events`/`getState`/`subscribe` props from termBase; drop the `getProvider()` lazy cache.
- Any app consumers of `term.events()` — grep first; @km/tui goes through createApp, not directly.

## Acceptance criteria

- [ ] `grep -rn "term\.events\(\)\|term\.getState\(\)\|term\.subscribe\(" apps packages vendor/silvery --include='*.ts' --include='*.tsx' | grep -v '/dist/\|node_modules\|\.test\.' ` returns 0
- [ ] `term.input.onKey/onMouse/onPaste/onFocus` are the only consumer-facing subscription APIs
- [ ] createApp's event loop fed by `term.input.on*` (not `term.events()`)
- [ ] ANSI parsers live in `runtime/input-owner.ts`, not `runtime/term-provider.ts`
- [ ] Existing key / mouse / paste / focus tests pass
- [ ] @km/tui 2511 tests pass
- [ ] tsc 0 non-vendor errors
- [ ] No `@deprecated` annotations left behind

## Mandatory

Read docs/lessons/refactoring.md IN FULL before writing any code. Delete old surface in the same phase as introducing the new one — no compat shims, no dual paths.

## Parent

@km/silvery/term-sub-owners (even though that epic is closed, this is the logical follow-up; feel free to re-open it or leave this standalone).

