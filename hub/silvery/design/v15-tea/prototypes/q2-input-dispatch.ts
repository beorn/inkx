/**
 * Q2 Spike: Input Seam — Unified Dispatch vs Typed Methods
 *
 * Two approaches:
 * 1. Unified: dispatch(event: Event) where Event is a discriminated union
 * 2. Typed: onKey(key), onMouse(event), onPaste(text) — separate methods per input type
 *
 * TEA principle: Every user interaction is an event. Events flow through dispatch,
 * which may invoke commands or update state. This supports replay, testing, undo, AI.
 *
 * Verdict: Unified dispatch with discriminated union.
 * Reason: composability, replay/undo support, event sourcing foundation.
 */

import type { Command } from "./q1-nested-commands.js";

// ============================================================================
// Event System
// ============================================================================

/** Discriminated union of all possible input events */
export type InputEvent =
  | { kind: "key"; key: string; mods: Set<"ctrl" | "shift" | "alt" | "meta"> }
  | { kind: "mouse"; x: number; y: number; button: 0 | 1 | 2 }
  | { kind: "scroll"; direction: "up" | "down"; amount: number }
  | { kind: "paste"; text: string }
  | { kind: "focus"; target: string }
  | { kind: "blur" }
  | { kind: "resize"; width: number; height: number };

/** Generic event envelope for any app event */
export interface AppEvent {
  kind: string;
  [key: string]: any;
}

/** Plugins can handle events and produce effects/commands */
export type EventHandler<T extends AppEvent = AppEvent> = (
  event: T,
  state: any,
) => {
  effects?: any[];
  command?: Command;
  stateUpdate?: any;
};

// ============================================================================
// Dispatch System
// ============================================================================

export interface HasDispatch {
  dispatch(event: InputEvent): void;
}

export function withDispatch<A extends object>(app: A): A & HasDispatch {
  const handlers: Map<string, EventHandler[]> = new Map();

  return {
    ...app,
    dispatch: (event: InputEvent) => {
      const kind = event.kind;
      const eventHandlers = handlers.get(kind) || [];
      for (const handler of eventHandlers) {
        const result = handler(event, (app as any).state);
        if (result.command) {
          // Invoke the command
          result.command.invoke((event as any));
        }
        if (result.stateUpdate) {
          // Update state
          (app as any).state = {
            ...(app as any).state,
            ...result.stateUpdate,
          };
        }
      }
    },
    _registerEventHandler(kind: string, handler: EventHandler) {
      if (!handlers.has(kind)) {
        handlers.set(kind, []);
      }
      handlers.get(kind)!.push(handler);
    },
  };
}

// ============================================================================
// Input Plugin: Keyboard
// ============================================================================

export function withKeyboardInput<A extends object & HasDispatch>(
  app: A,
): A & { keymap?: Map<string, Command> } {
  // Key → command mapping (can be contributed by other plugins)
  const keymap = new Map<string, Command>();

  // Register keyboard event handler
  (app as any)._registerEventHandler("key", (event: any) => {
    const keyStr = event.key;
    const command = keymap.get(keyStr);
    if (command) {
      return { command };
    }
    return {};
  });

  return {
    ...app,
    keymap,
  };
}

// ============================================================================
// Input Plugin: Mouse
// ============================================================================

export function withMouseInput<A extends object & HasDispatch>(app: A): A {
  (app as any)._registerEventHandler("mouse", (event: any) => {
    // Example: handle mouse click in a specific region
    if (event.y < 5) {
      // Top of screen — maybe open menu
      console.log("Mouse in header region");
    }
    return {};
  });

  return app;
}

// ============================================================================
// Input Plugin: Paste
// ============================================================================

export function withPasteInput<A extends object & HasDispatch>(app: A): A {
  (app as any)._registerEventHandler("paste", (event: any) => {
    // Handle paste events
    console.log("Paste received:", event.text);
    return {
      stateUpdate: { lastPaste: event.text },
    };
  });

  return app;
}

// ============================================================================
// Demo App
// ============================================================================

const seed = {
  state: { lastPaste: "" },
  commands: {},
};

const app = [seed]
  .reduce((a) => ({ ...a, commands: { ...a.commands, task: { toggle_done: { invoke: () => {} } } } }), seed)
  // Add dispatch
  .then((a: any) => withDispatch(a))
  // Add input handlers
  .then((a: any) => withKeyboardInput(a))
  .then((a: any) => withMouseInput(a))
  .then((a: any) => withPasteInput(a));

// ============================================================================
// Usage Examples
// ============================================================================

/**
 * Dispatching events is the single entry point for all user interactions.
 * This enables:
 *
 * ✅ Event sourcing: log all events for replay
 * ✅ Undo/redo: snapshot state before each event
 * ✅ Testing: send events, verify state changes
 * ✅ Macros: record + replay event sequences
 * ✅ AI automation: dispatch events programmatically
 * ✅ Multi-user: merge remote events into dispatch queue
 *
 * Example event flow:
 * 1. User presses 'x'
 * 2. Terminal captures and sends InputEvent { kind: "key", key: "x", mods: ... }
 * 3. dispatch(event) routes to keyboard handler
 * 4. Handler looks up keymap: "x" → app.commands.task.toggle_done
 * 5. Handler calls command.invoke(), which updates state or produces effects
 */

console.log("✅ Unified dispatch with discriminated union chosen for Q2");
console.log("   Reason: enables event sourcing, replay, undo, testing");
console.log("   Alternative (typed methods) rejected: less composable, harder to route");
