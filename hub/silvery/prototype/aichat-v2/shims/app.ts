/**
 * Shim for era2 app composition: create(), withScope(), withCommands(), withTerm(), withReact(), pipe().
 *
 * Typed plugin composition: generic constraint = requirement, mutation + cast = addition.
 * TypeScript checks plugin requirements at compile time via the overloaded pipe().
 * No `Plugin<Req, Add>` wrapper needed — the generic signature carries both.
 *
 * Why mutation + cast instead of spread?
 * Spread (`{ ...app, scope }`) breaks getters (`_exiting`) and closures that
 * reference the original object. Mutation preserves object identity — every
 * plugin operates on the same app instance, so closures and callbacks see
 * all properties regardless of when they were added.
 *
 * Production imports (these packages don't exist yet):
 *   pipe, create        → @silvery/create
 *   withScope           → @silvery/scope
 *   withCommands        → @silvery/commands
 *   withTerm            → @silvery/ag-term
 *   withReact           → @silvery/ag-react
 */

import type { ReactElement } from "react"
import { createApp as createSilveryApp, type AppHandle } from "@silvery/create"
import type { Key } from "@silvery/ag-term/runtime"
import type { Scope } from "./scope.js"
import type { Command, Mapping } from "./commands.js"
import { invoke } from "./commands.js"

// ── Types ───────────────────────────────────────────────────────

interface TermOptions {
  mode?: "inline" | "fullscreen"
  focusReporting?: boolean
}

/** Minimal app from create(). Plugins accumulate type information from here. */
export interface AppBase extends Disposable {
  defer(cleanup: (() => void) | void): void
  quit(): void
  readonly _exiting: boolean
}

/** Added by withCommands(). */
export interface WithCommands {
  commands: Record<string, Record<string, Command>>
  keymap(bindings: Record<string, any>): void
  _keys: Mapping<string>
}

/** Added by withTerm(). */
export interface WithTerm {
  _termOptions: TermOptions
}

/** Added by withReact(). */
export interface WithReact {
  _view: ReactElement
  _handle?: AppHandle<Record<string, unknown>>
  run(): Promise<void>
}

// ── pipe (overloaded — compile-time type accumulation) ──────────

export function pipe<A>(a: A): A
export function pipe<A, B>(a: A, f1: (a: A) => B): B
export function pipe<A, B, C>(a: A, f1: (a: A) => B, f2: (b: B) => C): C
export function pipe<A, B, C, D>(a: A, f1: (a: A) => B, f2: (b: B) => C, f3: (c: C) => D): D
export function pipe<A, B, C, D, E>(a: A, f1: (a: A) => B, f2: (b: B) => C, f3: (c: C) => D, f4: (d: D) => E): E
export function pipe<A, B, C, D, E, F>(
  a: A,
  f1: (a: A) => B,
  f2: (b: B) => C,
  f3: (c: C) => D,
  f4: (d: D) => E,
  f5: (e: E) => F,
): F
export function pipe<A, B, C, D, E, F, G>(
  a: A,
  f1: (a: A) => B,
  f2: (b: B) => C,
  f3: (c: C) => D,
  f4: (d: D) => E,
  f5: (e: E) => F,
  f6: (f: F) => G,
): G
export function pipe<A, B, C, D, E, F, G, H>(
  a: A,
  f1: (a: A) => B,
  f2: (b: B) => C,
  f3: (c: C) => D,
  f4: (d: D) => E,
  f5: (e: E) => F,
  f6: (f: F) => G,
  f7: (g: G) => H,
): H
export function pipe<A, B, C, D, E, F, G, H, I>(
  a: A,
  f1: (a: A) => B,
  f2: (b: B) => C,
  f3: (c: C) => D,
  f4: (d: D) => E,
  f5: (e: E) => F,
  f6: (f: F) => G,
  f7: (g: G) => H,
  f8: (h: H) => I,
): I
export function pipe(initial: any, ...fns: ((arg: any) => any)[]): any {
  return fns.reduce((acc, fn) => fn(acc), initial)
}

// ── create() — foundation with DisposableStack ──────────────────

export function create(): AppBase {
  const stack = new DisposableStack()
  let exiting = false

  return {
    get _exiting() {
      return exiting
    },
    defer(cleanup) {
      if (typeof cleanup === "function") stack.defer(cleanup)
    },
    quit() {
      exiting = true
      stack.dispose()
    },
    [Symbol.dispose]() {
      stack.dispose()
    },
  }
}

// ── extend() — typed mutation helper ─────────────────────────────
//
// Hides the `as A & B` cast. Mutation preserves object identity —
// getters, closures, and callbacks all see the added properties.

export function extend<A extends object, B extends object>(app: A, additions: B): A & B {
  return Object.assign(app, additions) as A & B
}

// ── withScope() — structured concurrency ────────────────────────

export function withScope(scope: Scope) {
  return <A extends AppBase>(app: A) => {
    app.defer(() => scope[Symbol.dispose]())
    return extend(app, { scope })
  }
}

// ── withCommands() — command + keymap infrastructure ────────────

export function withCommands() {
  return <A extends AppBase>(app: A) => {
    const bindings: Array<{
      key: string
      command: Command
      args?: Record<string, unknown>
      when?: () => boolean
    }> = []

    const commands: WithCommands["commands"] = {}

    const keymap: WithCommands["keymap"] = (rawBindings: Record<string, any>) => {
      for (const [key, value] of Object.entries(rawBindings)) {
        if (value && typeof value === "object" && "when" in value) {
          bindings.push({ key, command: value.binding ?? value.command, when: value.when })
        } else if (value && typeof value === "object" && "fn" in value) {
          bindings.push({ key, command: value })
        }
      }
    }

    const _keys: WithCommands["_keys"] = (event: string) => {
      for (const b of bindings) {
        if (b.when && !b.when()) continue
        if (b.key === event) return { command: b.command, args: b.args }
      }
      return null
    }

    return extend(app, { commands, keymap, _keys })
  }
}

// ── withTerm() — terminal renderer configuration ────────────────

export function withTerm(options?: TermOptions) {
  return <A extends AppBase>(app: A) => {
    return extend(app, { _termOptions: options ?? {} } as WithTerm)
  }
}

// ── withReact() — React adapter ─────────────────────────────────

function normalizeKey(input: string, key: Key): string {
  if (key.escape) return "escape"
  if (key.ctrl) return `ctrl+${input}`
  return input
}

export function withReact({ view }: { view: ReactElement }) {
  return <A extends AppBase & WithCommands & WithTerm>(app: A) => {
    const run = async () => {
      const silveryApp = createSilveryApp(() => () => ({}), {
        "term:key": (data) => {
          const { input, key } = data as { input: string; key: Key }
          const inv = result._keys(normalizeKey(input, key))
          if (inv) {
            try {
              const r = invoke(inv)
              if (r && typeof r === "object" && "catch" in r) (r as Promise<unknown>).catch(console.error)
            } catch (e) {
              console.error("Command error:", e)
            }
          }
          if (result._exiting) return "exit"
        },
      })

      const handle = await silveryApp.run(view, {
        mode: result._termOptions.mode ?? "inline",
        focusReporting: result._termOptions.focusReporting ?? true,
      })

      result._handle = handle
      result.defer(() => handle.unmount())
      await handle.waitUntilExit()
    }

    const result = extend(app, { _view: view, run } as WithReact)
    return result
  }
}
