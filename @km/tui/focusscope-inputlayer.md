---
mentions:
  - km
  - Bjørn
id: "@km/tui/focusscope-inputlayer"
aliases:
  - km-tui.focusscope-inputlayer
  - km-tui-focusscope-inputlayer
created_by: claude:d3a7049b
created_at: 2026-02-21T16:32:29Z
closed_at: 2026-04-09T06:57:17Z
close_reason: "Phase 1 shipped (commit 7ef4feff5): onKeyUp dispatch in silvery
  (636a12ce), TEA-first input principle documented in selection-state-spec.md,
  focusScope integration with ModeStack via bindFocusManager. Remaining Levels
  2-4 tracked in km-silvery.input-event-model."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Discuss: integrate focusScope with InputLayerProvider @km/tui #task #P3 @Bjørn Stabell

## TEA-First Input Architecture with Focus-Aware Routing

NOT 'move handlers to components.' TEA owns ALL input. Components DECLARE what they handle via the command registry (keybindings + when predicates). TEA resolves which command wins based on focus context, then dispatches.

### The Model (era2 vision)

```
terminal input → parser → TEA command system
  → resolves command based on: key + mode + focus context
  → dispatches to the right handler (board-actions, dialog, text editor)
  → if unhandled, bubbles up through focus scopes
  → root scope = fallback/global commands
```

Focus scope tells TEA 'this subtree is active, these commands apply here.' TEA still dispatches everything. Components never directly intercept stdin.

### What focusScope provides to TEA

1. **Focus context for when() predicates** — 'this dialog has focus' enables dialog commands, disables board commands. No manual when: dialogOpen guards — focus scope IS the guard.
2. **Command scoping** — commands registered in a scope only fire when that scope is active. A dialog's Escape is scoped to the dialog, not global.
3. **Bubble semantics** — unhandled keys bubble from focused scope → parent scope → root. TEA controls dispatch at each level.

### What onKeyDown is (escape hatch, NOT primary model)

`onKeyDown` on Box is a low-level escape hatch for components that need raw DOM-like key access (games, custom widgets). The PRIMARY input model is: register commands with keybindings + when predicates. TEA dispatches.

This matches VS Code: commands are centralized, when clauses determine availability based on context (which editor has focus, what mode), and the component receives the action — it never listens for raw keys.

### Migration (same phases, different framing)

1. **Dialogs** — dialog IS a focusScope. Dialog commands registered with when: inDialogScope. TEA routes to dialog handler when dialog scope is active. Replaces manual when: dialogOpen guards.
2. **Text input** — text editing commands registered with when: inEditScope. TEA routes to text handler. Replaces TEA text op dispatching.
3. **Focus-aware command resolution** — TEA's resolveKeybinding checks focus scope stack to determine which commands are available. The when() system gains focus-scope awareness.
4. **Remove InputLayerProvider** — the stack-based shim is no longer needed; focus scope tree IS the routing.

### What stays centralized

- Keybinding registry (introspectable — help overlay, which-key, command palette)
- Command definitions (id, name, execute, when)
- Key resolution (TEA resolves which command wins)
- Dispatch (TEA calls the handler)

### What moves to components (declaration only)

- Scope boundaries (focusScope prop on Box)
- Scope-local command registration (commands available only in this scope)
- NOT event handling — TEA still handles events

### Anti-pattern: component-level key interception

```tsx
// WRONG — decentralized, TEA loses visibility
<Box onKeyDown={(e) => { if (e.key === 'Escape') closeDialog() }} />

// RIGHT — centralized, TEA dispatches
registerCommand({ id: 'dialog.close', key: 'Escape', when: inDialogScope, execute: closeDialog })
```

