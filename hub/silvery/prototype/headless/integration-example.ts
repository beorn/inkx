/**
 * Era2b Integration Example
 *
 * Shows how @silvery/headless machines compose with the era2b architecture:
 * signals + headless + commands + domain plugins.
 *
 * This is NOT runnable code — it uses the era2b API that doesn't exist yet.
 * It validates that the headless design fits cleanly into the full stack.
 *
 * Compare with the aichat-v2 prototype in ../aichat-v2/ which validated
 * the signals/commands API. This validates the headless integration layer.
 */

// =============================================================================
// 1. Headless machines (from @silvery/headless — exists as prototype)
// =============================================================================

import type { SelectListState, SelectListAction } from "./select-list.ts"
import { selectListUpdate, createSelectListState } from "./select-list.ts"
import type { ReadlineState, ReadlineAction } from "./readline.ts"
import { readlineUpdate, createReadlineState, createReadlineContext } from "./readline.ts"

// =============================================================================
// 2. Signals integration (from @silvery/signals — pseudo-code, uses alien-signals)
// =============================================================================

// These would be real imports from @silvery/signals:
// import { signal, computed, batch } from "@silvery/signals"

// Simulated types for this example (production: @silvery/create, @silvery/signals)
type Signal<T> = { (): T; (value: T): void }
declare function signal<T>(initial: T): Signal<T>
declare function computed<T>(fn: () => T): { (): T }

interface AppBase {
  defer(fn: () => void): void
  quit(): void
}

interface WithCommands {
  commands: Record<string, Record<string, { fn: (...args: any[]) => any; title?: string; description?: string }>>
  keymap(bindings: Record<string, any>): void
}

// =============================================================================
// 3. The pattern: signal-backed headless machine
// =============================================================================

/**
 * Bridge a headless machine to a signal.
 *
 * Returns a dispatch function that updates the signal via the machine's
 * update function. The signal IS the state — subscribers react to changes.
 */
function signalMachine<S, A>(
  update: (state: S, action: A) => S,
  initial: S,
): { state: Signal<S>; send: (action: A) => void } {
  const state = signal(initial)
  return {
    state,
    send(action: A) {
      const next = update(state(), action)
      if (next !== state()) state(next) // identity check — skip no-ops
    },
  }
}

// =============================================================================
// 4. Domain model using headless machines
// =============================================================================

interface TodoItem {
  id: string
  text: string
  done: boolean
}

/**
 * Todo domain model.
 *
 * Uses signals for data and headless machines for interaction state.
 * The model is framework-agnostic — works with React, Svelte, or headless.
 */
function createTodoModel() {
  // Domain data
  const items = signal<TodoItem[]>([
    { id: "1", text: "Buy milk", done: false },
    { id: "2", text: "Write tests", done: false },
    { id: "3", text: "Ship era2b", done: false },
  ])

  // Headless machine for list navigation
  const list = signalMachine(selectListUpdate, createSelectListState({ count: 3 }))

  // Headless machine for add-item input
  const rlCtx = createReadlineContext() // shared kill ring
  const input = signal(createReadlineState())

  // Derived state
  const currentItem = computed(() => items()[list.state().index])
  const hasItems = computed(() => items().length > 0)

  // Updaters (these are the methods that commands will call)
  return {
    // Signals (readable state)
    items,
    input,
    list,
    currentItem,
    hasItems,

    // Updaters
    add(text: string) {
      const id = String(Date.now())
      items([...items(), { id, text, done: false }])
      list.send({ type: "set_count", count: items().length })
      // Clear input
      input(readlineUpdate(input(), { type: "clear" }))
    },

    toggleDone() {
      const idx = list.state().index
      const updated = items().map((item, i) => (i === idx ? { ...item, done: !item.done } : item))
      items(updated)
    },

    remove() {
      const idx = list.state().index
      items(items().filter((_, i) => i !== idx))
      list.send({ type: "set_count", count: items().length })
    },

    // Input editing via headless readline
    editInput(action: ReadlineAction) {
      input(rlCtx.update(input(), action))
    },
  }
}

// =============================================================================
// 5. Domain plugin (era2b pattern)
// =============================================================================

/**
 * withTodo — domain plugin.
 *
 * Co-locates model + commands + keybindings in one plugin.
 * This is the era2b composition pattern from 04-app.md.
 */
function withTodo() {
  return <A extends AppBase & WithCommands>(app: A) => {
    const todo = createTodoModel()

    const extended = app as A & { todo: ReturnType<typeof createTodoModel> }
    extended.todo = todo

    // Command tree — tree placement IS registration
    extended.commands.todo = {
      move_down: {
        title: "Move Down",
        fn() {
          todo.list.send({ type: "move_down" })
        },
      },
      move_up: {
        title: "Move Up",
        fn() {
          todo.list.send({ type: "move_up" })
        },
      },
      toggle_done: {
        title: "Toggle Done",
        description: "Toggle the done state of the current task",
        fn() {
          todo.toggleDone()
        },
      },
      remove: {
        title: "Remove",
        fn() {
          todo.remove()
        },
      },
      submit: {
        title: "Add Todo",
        description: "Add a new todo from the input field",
        fn() {
          const text = todo.input().value.trim()
          if (text) todo.add(text)
        },
      },
    }

    // Keybindings
    extended.keymap({
      j: extended.commands.todo.move_down,
      k: extended.commands.todo.move_up,
      x: extended.commands.todo.toggle_done,
      d: extended.commands.todo.remove,
      Return: extended.commands.todo.submit,
    })

    return extended
  }
}

// =============================================================================
// 6. The composition (era2b pipe pattern)
// =============================================================================

// This is what a full era2b app looks like:
//
// using app = pipe(
//   create(),
//   withScope(scope),
//   withCommands(),
//   withTerm(),
//   withReact({ view: <TodoApp /> }),
//   withTodo(),
// )
// await app.run()

// =============================================================================
// 7. React view (thin — reads signals, dispatches commands)
// =============================================================================

// function TodoApp() {
//   const items = useSignal(app.todo.items)
//   const listState = useSignal(app.todo.list.state)
//   const input = useSignal(app.todo.input)
//
//   return (
//     <Box flexDirection="column">
//       <SelectList
//         items={items.map(i => ({ label: `${i.done ? '✓' : '○'} ${i.text}`, value: i.id }))}
//         highlightedIndex={listState.index}
//       />
//       <TextInput
//         value={input.value}
//         placeholder="Add todo..."
//       />
//     </Box>
//   )
// }

// =============================================================================
// 8. Testing (no React, no rendering needed)
// =============================================================================

// test("toggle done", () => {
//   const todo = createTodoModel()
//   todo.list.send({ type: "move_to", index: 1 })
//   todo.toggleDone()
//   expect(todo.items()[1].done).toBe(true)
//   expect(todo.items()[0].done).toBe(false)
// })
//
// test("add item updates list count", () => {
//   const todo = createTodoModel()
//   expect(todo.list.state().count).toBe(3)
//   todo.add("New item")
//   expect(todo.list.state().count).toBe(4)
//   expect(todo.items()).toHaveLength(4)
// })
//
// test("command dispatch", () => {
//   const app = pipe(create(), withCommands(), withTodo())
//   app.commands.todo.toggle_done.fn()
//   expect(app.todo.items()[0].done).toBe(true)
// })

export { createTodoModel, withTodo }
