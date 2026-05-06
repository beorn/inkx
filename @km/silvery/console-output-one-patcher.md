---
mentions:
  - km
id: "@km/silvery/console-output-one-patcher"
aliases:
  - km-silvery.console-output-one-patcher
  - km-silvery-console-output-one-patcher
created_by: claude:019d032d
created_at: 2026-04-23T00:26:33Z
closed_at: 2026-04-23T01:04:25Z
close_reason: Shipped silvery f8a9ab72 + km bump. Console tap + Output sink
  coexist on shared ConsoleRouter; 3 coexistence tests verify both orderings; 36
  owner tests + 2511 km-tui pass.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.console-output-one-patcher
    depends_on_id: km-silvery.term-sub-owners
    type: parent-child
    created_at: 2026-04-22T17:26:33Z
    created_by: claude:019d032d
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery.term-sub-owners
---

# [x] Console + Output share one patcher (kill the ordering hazard) @km/silvery #task #P1

blocks:: [[@km/silvery/term-sub-owners]]

## Problem (Pro-review P0-3)

Both `term.console` and `term.output` independently monkey-patch `console.log/info/warn/error/debug`. Whichever activates last wins — but they're active simultaneously and each holds a reference to its own "original" which is either the real method or the other's wrapper, depending on activation order.

Documented contract (post-135f5f74) is Output-first, Console-second. It works today but:

- It is convention-enforced, not structure-enforced
- Console's own `restore() + capture()` cannot cleanly re-layer (Console's install reuses its original-map on subsequent captures, which breaks under a foreign patcher)
- Any new patcher in the future has the same hazard
- @km/tui's consoleOwner currently captures BEFORE boardApp.run() (startup buffering), which means Output ACTIVATES over Console's tap and entries during alt-screen are lost for the captured instance. This is the broken case in production.

## Solution

One shared `ConsoleRouter` owned by the Term. Both Console and Output register policies against it:

- `router.registerTap(handler)` → called on every method
- `router.registerSink({ suppress, redirectFd })` → controls forward-vs-drop

Single install of the five `console.*` wrappers. Deterministic ordering. Restore symmetric with activation.

See section "The structural fix" in the Pro review dump at /tmp/llm-019d032d-review-the-signal-native-term-6nkk.txt.

## Acceptance

- [ ] New `devices/console-router.ts` module (or similar) owns the one patch
- [ ] `Output.activate()` no longer patches console.* directly — it registers a sink policy
- [ ] `Console.capture()` no longer patches directly — it registers a tap
- [ ] Test: capture-before-activate OR activate-before-capture both result in entries landing in Console's tap
- [ ] @km/tui's current consoleOwner flow captures during alt-screen (regression test)
- [ ] Dispose order is deterministic; no stale-wrapper bugs

