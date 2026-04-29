---
id: "@km/infra/termless-keybinding-tests"
aliases:
  - km-infra.termless-keybinding-tests
  - km-infra-termless-keybinding-tests
created_by: claude:656602a3
created_at: 2026-03-17T06:38:12Z
closed_at: 2026-03-17T07:37:24Z
close_reason: "Created keybinding-matrix.slow.test.ts with 268 tests. Full
  roundtrip: extract keybindings → encode to ANSI → parse back → verify match.
  Found real issues: keyToString missing PageUp/PageDown, legacy ANSI ambiguity
  for ctrl-i/j/m, Cmd+Arrow terminal consumption."
---

# [x] Termless PTY test suite for keybindings: verify real terminal delivers expected key events @km/infra #task #P1 @claude:656602a3

Termless cross-backend matrix test suite for keybindings.

**Problem**: Unit tests verify keybinding resolution (key string → command) but NOT whether terminals actually deliver those key combinations. Cmd+Arrow is consumed by Ghostty/iTerm. We shipped broken keybindings because no test caught this.

**Solution**: Matrix test that runs every keybinding against every terminal backend:

```
Backends: xterm.js, ghostty (WASM), vt100
Keys: every registered keybinding from defaultKeybindingLayers()
Test: press key → verify the expected command ID appears in status/diagnostics
```

**Architecture**:
1. Extract all keybindings from `defaultKeybindingLayers()`
2. For each backend × keybinding:
   - Spawn km via PTY (or use Term.sendInput for in-process)
   - Send the key sequence via the backend's input encoding
   - Verify the app received and resolved the expected command
3. Flag keybindings that fail on specific backends (e.g., Cmd+Arrow on Ghostty)

**Deliverables**:
- `vendor/silvery/tests/keybinding-matrix.slow.test.ts` — cross-backend key delivery tests
- Report: which modifier+key combos work on which terminals
- Update keybindings.ts with `// Note: not delivered by [backend]` comments

**Depends on**: Term.sendInput() for in-process testing, or PTY spawning for full integration.

See also: docs/design/terminal-integration-testing.md