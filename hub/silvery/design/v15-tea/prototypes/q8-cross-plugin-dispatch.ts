/**
 * Q8 Spike: Cross-Plugin Dispatch
 *
 * When one plugin needs to invoke a command from another domain, three approaches:
 * 1. Direct: app.commands.other.action.invoke(args) — tight coupling, type-safe
 * 2. Effect: queue an effect that another plugin handles — loose coupling, async
 * 3. Unified dispatch: emit dispatch({kind:"command", path}) event — indirect, flexible
 *
 * Context: era2b composes plugins in order. Plugin A can reference app.commands.B
 * directly if B was composed first (enforced by pipe type constraints).
 *
 * Verdict: Dual approach.
 * - Direct calls for same-domain operations (commands within a domain).
 * - Dispatch events for cross-domain operations needing decoupling or async behavior.
 */

import type { InputEvent } from "./q2-input-dispatch.js";
import type { Command, CommandResult } from "./q3-effects.js";

// ============================================================================
// Command Dispatch Event
// ============================================================================

/** Event to invoke a command indirectly via dispatch */
export interface CommandDispatchEvent {
  kind: "command";
  path: string; // "domain.action"
  args?: any;
}

/** Extended InputEvent type to include command dispatch */
export type AppInputEvent = InputEvent | CommandDispatchEvent;

// ============================================================================
// Approach 1: Direct Command Calls (Type-Safe)
// ============================================================================

/**
 * Plugin A directly calls Plugin B's commands.
 * Requires B to be composed before A (enforced by types).
 * Tight coupling, but clearest and fastest.
 */

export function withNotificationPlugin<
  A extends {
    commands: {
      task?: { toggle_done?: Command; add?: Command };
    };
  },
>(app: A): A {
  const notifyCommands = {
    send: {
      invoke: (message: string) => {
        // Direct call to task.toggle_done (assumes task domain exists)
        if (app.commands.task?.toggle_done) {
          const result = app.commands.task.toggle_done.invoke("task-1");
          console.log("Notified after toggling task:", result);
        }
        return { type: "notification.send", message };
      },
      help: "Send a notification and update related tasks",
    },
  };

  return {
    ...app,
    commands: {
      ...app.commands,
      notification: notifyCommands,
    },
  };
}

// ============================================================================
// Approach 2: Event-Based Cross-Plugin Dispatch (Decoupled)
// ============================================================================

/**
 * Plugin A emits a dispatch event; another plugin handles it.
 * Loose coupling — plugins don't know about each other.
 * Async-friendly, can be logged/replayed.
 */

export function withEventDispatcher<A extends { state: any }>(app: A): A & {
  dispatch(event: AppInputEvent): void;
  _handleCommandDispatch(event: CommandDispatchEvent): any;
} {
  const eventHandlers: Map<
    string,
    (e: AppInputEvent) => void
  > = new Map();

  const handleCommandDispatch = (event: CommandDispatchEvent) => {
    console.log(`[Dispatch] ${event.path}(${JSON.stringify(event.args)})`);
    // In real impl, walk app.commands via path, invoke command
    // For now, just log
    return { type: "command", path: event.path, result: "executed" };
  };

  return {
    ...app,
    dispatch: (event: AppInputEvent) => {
      if (event.kind === "command") {
        return handleCommandDispatch(event);
      }
      // Handle other event types...
    },
    _handleCommandDispatch: handleCommandDispatch,
  };
}

// ============================================================================
// Approach 3: Effect-Based Cross-Plugin Actions
// ============================================================================

/**
 * One plugin queues an effect; another plugin's effect handler responds.
 * Similar to approach 2 but uses the effects queue.
 * Good for batching, prioritizing, or deferring actions.
 */

export function withTaskNotificationIntegration<A extends { state: any }>(
  app: A,
): A {
  // Register an effect handler for "notify.task"
  (app as any)._registerEffectHandler(
    "notify.task",
    async (effect: any) => {
      console.log(`[Effect Handler] Notifying task ${effect.payload.taskId}`);
      // In real app, this might call task.toggle_done or task.add
      return { notified: true };
    },
  );

  return app;
}

// ============================================================================
// Hybrid Example: Using All Three Approaches
// ============================================================================

console.log("=== Q8: Cross-Plugin Dispatch Approaches ===\n");

console.log("1. Direct Command Calls:");
console.log("   Pro: Type-safe, no overhead, discoverable");
console.log("   Con: Tight coupling, requires specific compose order\n");

console.log("2. Event Dispatch:");
console.log("   Pro: Loose coupling, event sourcing, replayable");
console.log("   Con: Indirection, harder to type\n");

console.log("3. Effect Handlers:");
console.log("   Pro: Async-friendly, batching, priority");
console.log("   Con: Requires effect queue, asynchronous\n");

// ============================================================================
// Recommendation
// ============================================================================

/**
 * VERDICT: Dual approach (Direct + Event Dispatch).
 *
 * ✅ Default to direct calls when:
 *   - Plugin A explicitly depends on Plugin B (type constraint enforces order)
 *   - Action is synchronous and must be immediate
 *   - Commands are in the same domain (e.g., task.toggle_done calling task.add)
 *
 * ✅ Use event dispatch when:
 *   - Loose coupling needed (A doesn't know about B)
 *   - Action might fail or be deferred
 *   - Replay/undo/event sourcing is important
 *   - Multiple plugins might handle the same event type
 *
 * ✅ Use effects for:
 *   - Side effects (API calls, file I/O, async work)
 *   - Batch operations
 *   - Decoupled integration with external systems
 *
 * IMPLEMENTATION: Plugins register command dispatch handlers in dispatch system.
 * When dispatch({kind:"command", path}) is called, the dispatcher walks app.commands,
 * finds the command, invokes it, handles errors, and optionally logs for replay.
 *
 * NEXT STEP: Spike a unified dispatcher that handles all three patterns.
 */
