---
id: "@km/silvery/era2-proto-bugs-v2"
aliases:
  - km-silvery.era2-proto-bugs-v2
  - km-silvery-era2-proto-bugs-v2
created_by: claude:f8196c1c
created_at: 2026-03-21T06:41:56Z
closed_at: 2026-03-23T20:53:43Z
close_reason: "All 3 bugs fixed: keystroke subscription recursion, term:key
  return exit, idle auto-submit direct call"
---

# [x] Prototype bugs: keystrokes eaten, ctrl-d broken, idle auto-submit not working @km/silvery #bug #P0 @claude:f8196c1c

Three runtime bugs confirmed via TTY testing (session-1):

1. **Keystrokes eaten** — typed 'hello world' but input field stays 'Type a message...'. Text never appears. Event loop starvation from drain() is NOT the cause (setTimeout(0) didn't help). The keystrokes may not be reaching TextArea — could be focus issue, event routing, or the keymap consuming them.

2. **ctrl-d doesn't quit** — withKeymap registers ctrl+d→exit when isBlank. Either: (a) keybinding isn't firing, (b) isBlank computed doesn't work (shim polls, doesn't push), (c) ctrl+d is consumed by terminal/TextArea before reaching keymap, or (d) the exit command fires but app doesn't actually unmount.

3. **Idle auto-submit not working** — withDemoScript arms a 10s timer on startup. After 10s the placeholder should auto-submit. Timer may not fire (scope.timeout issue), or the invoke() call may fail.

## What we know
- The demo auto-advance DOES work — first script entry plays on startup (thinking → streaming → tool → settled)
- Rendering works correctly — all visual elements render properly
- The setTimeout(0) in drain() was a wrong fix — reverted reasoning needed

## Debugging approach
1. Add DEBUG logging to the term:key handler in withReact shim — are keystrokes arriving?
2. Add logging to keymap dispatch — is the keymap being consulted?
3. Check TextArea's onChange — is it receiving key events?
4. Check idle timer — is scope.timeout actually scheduling?
5. Test escape key — does it quit? (simpler than ctrl+d, no when() predicate)