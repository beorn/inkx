---
id: "@km/silvery/era2-proto-bugs"
aliases:
  - km-silvery.era2-proto-bugs
  - km-silvery-era2-proto-bugs
created_by: claude:f8196c1c
created_at: 2026-03-21T06:35:21Z
closed_at: 2026-03-21T06:39:02Z
close_reason: "Fixed: drain() yields to event loop between iterations
  (setTimeout(0)). Fixes missing keystrokes, auto-advance, and streaming
  display."
---

# [x] Prototype runtime bugs: ctrl-d, missing keystrokes, no delays @km/silvery #bug #P1 @claude:f8196c1c

Three runtime bugs in the aichat-v2 prototype:

1. **ctrl-d removes focus instead of quitting** — withKeymap registers ctrl+d→exit when isBlank. Either the keybinding isn't firing, isBlank isn't evaluating correctly (computed shim is polling-based), or the event is consumed by TextArea/focus system before reaching the keymap.

2. **Missing keystrokes** — only every few keystrokes show in the input. Likely event loop starvation from the synchronous streaming. drain(streamAgentReply(...)) yields chunks with no delays, blocking the event loop. The old prototype had scope.sleep(50) between words — that yielded to the event loop. The new AI provider pattern moved delays out of the consumer but the demo provider doesn't add them back.

3. **Auto-run doesn't work** — withDemoScript calls chat.submit(text) on startup which triggers generateReply() which drain()s the stream. Without delays in the provider, the entire response completes synchronously before rendering starts.

## Root cause
The demo AI provider (createDemoDriver) yields chunks synchronously — no delays between words, thinking, or tool reveals. The old prototype had delays in streamReply(); the new architecture moved responsibility to the provider but didn't add delays to the demo provider.

## Fix
Add scope.sleep() delays to the demo provider's generateResponse(). The provider controls pacing, not the consumer. Also needs access to scope for cancellable delays — either pass scope to createDemoDriver or use the fx shim.