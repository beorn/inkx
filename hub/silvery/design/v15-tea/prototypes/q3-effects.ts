/**
 * Q3 Spike: Effects Model — TEA-Pure vs Plugin-Based
 *
 * Two approaches:
 * 1. TEA-pure: Command returns [state, effects] tuple
 * 2. Plugin-based: Effect plugin manages async work separately, commands return state only
 *
 * Era2b principle: Simpler > pure. Plugins handle effects via a dedicated seam.
 * Commands invoke cleanly: result = command.invoke(args); state updates are explicit.
 * Side effects (API calls, file writes, async operations) are queued and handled by an Effects plugin.
 *
 * Verdict: Plugin-based effects with a Queue<Effect> in state.
 * Reason: cleaner command interface, simpler composition, effects are isolated.
 */

// ============================================================================
// Effects Type System
// ============================================================================

/** Generic effect that can be queued and executed */
export interface Effect<T = any> {
  kind: string;
  payload?: T;
  onSuccess?: (result: any) => void;
  onError?: (error: any) => void;
}

/** Result from command execution */
export interface CommandResult<State = any> {
  state: State;
  effects?: Effect[];
}

// ============================================================================
// Command System (Updated with Effects Support)
// ============================================================================

export interface Command<Args = any, Result = any> {
  invoke(args: Args): Result | CommandResult;
  name?: string;
  help?: string;
  effects?: Effect[];
}

// ============================================================================
// Plugin: Effects Queue & Executor
// ============================================================================

export interface HasEffects {
  state: { effectQueue: Effect[] };
  flushEffects(): void;
  queueEffect(effect: Effect): void;
}

export function withEffects<A extends { state: any }>(
  app: A,
): A & HasEffects {
  // Ensure state has effectQueue
  if (!app.state.effectQueue) {
    app.state.effectQueue = [];
  }

  const effectHandlers: Map<
    string,
    (effect: Effect) => Promise<any>
  > = new Map();

  return {
    ...app,
    queueEffect(effect: Effect) {
      app.state.effectQueue.push(effect);
    },
    flushEffects: async () => {
      const queue = [...app.state.effectQueue];
      app.state.effectQueue = [];

      for (const effect of queue) {
        const handler = effectHandlers.get(effect.kind);
        if (!handler) {
          console.warn(`No handler for effect: ${effect.kind}`);
          continue;
        }

        try {
          const result = await handler(effect);
          effect.onSuccess?.(result);
        } catch (error) {
          effect.onError?.(error);
        }
      }
    },
    _registerEffectHandler(kind: string, handler: (e: Effect) => Promise<any>) {
      effectHandlers.set(kind, handler);
    },
  };
}

// ============================================================================
// Example: Task Persistence Plugin
// ============================================================================

export function withTaskPersistence<A extends { state: any }>(
  app: A,
): A {
  // Register handler for "save.task" effects
  (app as any)._registerEffectHandler(
    "save.task",
    async (effect: Effect) => {
      // Simulate async save to DB or API
      console.log(`[Effect] Saving task:`, effect.payload);
      await new Promise((resolve) => setTimeout(resolve, 100));
      return { id: `task-${Date.now()}` };
    },
  );

  // Add a task command that queues effects
  const taskCommands = {
    add: {
      invoke: (title: string) => {
        const newTaskId = `task-${Date.now()}`;
        return {
          state: {
            tasks: [
              ...(app.state.tasks || []),
              { id: newTaskId, title, done: false },
            ],
          },
          effects: [
            {
              kind: "save.task",
              payload: { id: newTaskId, title },
            } as Effect,
          ],
        };
      },
      help: "Add a new task",
    },
    toggle: {
      invoke: (id: string) => {
        const tasks = app.state.tasks || [];
        const updated = tasks.map((t: any) =>
          t.id === id ? { ...t, done: !t.done } : t,
        );
        return {
          state: { tasks: updated },
          effects: [
            {
              kind: "save.task",
              payload: { id, done: !tasks.find((t: any) => t.id === id)?.done },
            } as Effect,
          ],
        };
      },
      help: "Toggle task done state",
    },
  };

  return {
    ...app,
    commands: {
      ...(app as any).commands,
      task: taskCommands,
    },
  };
}

// ============================================================================
// Plugin: HTTP Effects
// ============================================================================

export function withHttpEffects<A extends { state: any }>(app: A): A {
  (app as any)._registerEffectHandler("http.get", async (effect: Effect) => {
    console.log(`[Effect] HTTP GET:`, effect.payload?.url);
    // Real implementation would use fetch()
    return { status: 200, body: {} };
  });

  (app as any)._registerEffectHandler("http.post", async (effect: Effect) => {
    console.log(`[Effect] HTTP POST:`, effect.payload?.url);
    return { status: 201, body: {} };
  });

  return app;
}

// ============================================================================
// Demo: Composed App with Effects
// ============================================================================

const seed = {
  state: { tasks: [], effectQueue: [] },
  commands: {},
};

const app = [seed]
  .reduce(
    (a: any) => ({
      ...a,
      commands: {
        ...a.commands,
        nav: {
          open: {
            invoke: (path: string) => ({
              state: { currentPath: path },
            }),
          },
        },
      },
    }),
    seed,
  )
  .then((a: any) => withEffects(a))
  .then((a: any) => withTaskPersistence(a))
  .then((a: any) => withHttpEffects(a));

// ============================================================================
// Usage Examples
// ============================================================================

console.log("=== Command with Effects ===");

// Invoke a command that produces effects
const addResult = (app as any).commands.task.add.invoke("Buy groceries");
console.log("Command result:", addResult);

// Update state
if (addResult.state) {
  (app as any).state = { ...(app as any).state, ...addResult.state };
}

// Queue effects
if (addResult.effects) {
  for (const effect of addResult.effects) {
    (app as any).queueEffect(effect);
  }
}

console.log("State after command:", (app as any).state);
console.log("Effects queued:", (app as any).state.effectQueue.length);

// Flush effects (async)
(async () => {
  await (app as any).flushEffects();
  console.log("Effects flushed");
})();

// ============================================================================
// Q3 Resolution Analysis
// ============================================================================

/**
 * VERDICT: Plugin-based effects chosen for Q3.
 *
 * ✅ Simpler command interface: invoke() returns state or {state, effects}
 * ✅ Effects are isolated: a dedicated plugin handles the queue and dispatch
 * ✅ Composability: effects can be mocked, prioritized, batched, retried
 * ✅ Type safety: Effect is a discriminated union by kind
 * ✅ Async-friendly: flush effects after state updates, handle errors cleanly
 *
 * ✗ TEA-pure (tuple return): Requires all commands to return tuples, even if
 *   they have no effects. Adds boilerplate. Harder to mix sync/async.
 *
 * NEXT STEP: Merge with command + dispatch systems to show full flow.
 * Commands invoke → produce [state, effects] → state updates → effects queue → flush.
 */
