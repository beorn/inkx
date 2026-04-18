# Manual Verification — aichat-v2 Spike

This checklist validates the aichat-v2 prototype runs end-to-end in a real
terminal, which the headless tests can't cover. It's the "real TTY" half of
bead `km-silvery.tea-aichat`.

## Running the prototype

```bash
cd ~/Code/pim/km
bun hub/silvery/prototype/aichat-v2/app.tsx
```

The app uses the demo AI driver (`createDemoDriver(demo.SCRIPT)`) — no API
keys required. It scripts through a fake conversation in Ghostty-compatible
terminals.

## Automated smoke test (non-interactive)

A 3-second timeout run confirms the app boots without errors:

```bash
timeout 3 bun hub/silvery/prototype/aichat-v2/app.tsx | head -30
```

Expected: ANSI output showing:
- "AI Chat" title
- System intro message listing `@silvery/signals`, `@silvery/commands`, `@silvery/create`, `@silvery/scope`, `useModel()`
- First scripted user message ("Fix the login bug in auth.ts — ...")
- Agent response starting to stream (thinking indicator + partial text)
- Bordered input box with "Type a message..." placeholder

Exit code should be 0 (signal termination from timeout).

## Interactive verification checklist

The following cannot be validated by `termless` without a real keyboard
attached (Kitty keyboard protocol releases, focus events from window
manager, real paste from clipboard):

### Keybindings
- [ ] `Escape` → exits the app cleanly (no hung process, terminal restored)
- [ ] `Ctrl+C` → exits the app cleanly
- [ ] `Ctrl+D` (when draft is empty) → exits the app
- [ ] `Ctrl+L` → triggers `compact` command; "Compacting context..." system
      message appears briefly, then gets replaced with "Context compacted
      (X tokens frozen)"
- [ ] Type text → visible in the input box (cursor block visible)
- [ ] `Enter` → submits the current draft as a user message
- [ ] Empty draft + `Enter` → submits the AI-suggested placeholder instead

### React context wiring (fix from bead)
- [ ] `useChat()` / `useChatModel()` hooks throw clearly if used outside
      `<ChatProvider>`. Test: temporarily wrap `<ChatView />` without the
      provider — expect:
      `Error: useChat() called outside <ChatProvider>. Wrap the view in <ChatProvider chat={app.chat}>.`
- [ ] Normal flow: wrapped in `<ChatProvider chat={chat}>` — renders,
      updates live as signals change.

### Focus + terminal events
- [ ] Click outside the terminal, then back → input border changes color
      (blur / focus OSC 1004 reporting working)
- [ ] Resize the terminal horizontally → layout reflows; message text
      wraps to the new width
- [ ] Resize vertically → ListView adjusts (scrollback preserved)

### Streaming / lifecycle
- [ ] After first scripted message, the agent reply streams word-by-word
      (visible typing animation, not one-shot)
- [ ] Tool-use messages render with dotted spinner → checkmark when done
- [ ] Final token count appears in the status bar (`$0.01` or similar)
- [ ] Idle timer (10s after the last user message) auto-submits the next
      scripted user message — waiting 10s from the prompt should advance
      the conversation without any typing

### Cleanup
- [ ] After exit, terminal is restored (no leftover escape sequences, no
      cursor-hidden state, no alternate-screen artifacts)
- [ ] No orphaned `setTimeout` handles — the process terminates cleanly
      (not hung waiting for timers)

## Known limitations

- **No real LLM integration** — uses scripted demo. To test with a real
  API, replace `createDemoDriver(demo.SCRIPT)` in `main()` with a real
  `AIProvider` that talks to Claude/OpenAI/etc.
- **Demo script is finite** — once exhausted, the driver falls back to
  `RANDOM_AGENT_RESPONSES`. Long interactive sessions will loop.
- **No mouse support** — aichat-v2 is keyboard-only (no click handlers
  registered). Clicking doesn't do anything except trigger focus events.

## What the smoke test proves

Even without interactive verification, the `timeout 3` run proves:

1. **Composition succeeds**: `pipe(create(), withScope, withCommands,
   withTerm, withChat, withKeymap, withDemoScript, withReact)` produces
   a working app object with `app.run()`.
2. **React context bridge works**: `<ChatProvider>` provides the model;
   `useChat()` / `useChatModel()` resolve correctly; the first render
   shows live data from signals.
3. **Domain model + React**: signals (`messages`, `draft`, `placeholder`)
   drive the view via `useModel()` / `useSignal()`. Agent response
   streams, proving the delivery signal chain works.
4. **Silvery runtime integration**: `@silvery/ag-react` components
   (`Box`, `Text`, `ListView`, `TextArea`, `Spinner`) render correctly
   through the reconciler.

The `app.test.ts` + `apply-chain.test.ts` cover:
- Chat model domain logic (17 tests)
- Substrate apply-chain contract — Op / Effect / ApplyResult / BaseApp /
  with\*Chain plugins (15 tests)

Together, they validate the TEA Phase 3 design goal: the substrate
contract is sufficient for aichat-v2 before rolling out to km-tui.
