/**
 * Fuzz term — fake terminal providers for TUI fuzz testing.
 *
 * Implements silvery's Provider interface so it can replace the real terminal
 * with programmatic key sources (random or replayed sequences).
 *
 * @example
 * ```typescript
 * // Random keys
 * const term = createFuzzTerm({ keys: ['j','k','h','l'], count: 100, seed: 42 })
 * const app = createApp(<Board />, { term })
 * for await (const frame of app.run()) { ... }
 *
 * // Replay for shrinking/regression
 * const term = createReplayTerm(['j','j','k','l','j'])
 * ```
 */

import { createSeededRandom, type SeededRandom } from "vimonkey"

// ---------------------------------------------------------------------------
// Types (mirrors silvery Provider/Key shapes)
// ---------------------------------------------------------------------------

export interface FuzzState {
  cols: number
  rows: number
}

export interface FuzzKeyEvent {
  input: string
  key: FuzzKey
}

interface FuzzKey {
  upArrow: boolean
  downArrow: boolean
  leftArrow: boolean
  rightArrow: boolean
  pageDown: boolean
  pageUp: boolean
  home: boolean
  end: boolean
  return: boolean
  escape: boolean
  ctrl: boolean
  shift: boolean
  tab: boolean
  backspace: boolean
  delete: boolean
  meta: boolean
}

interface ProviderEvent<Events extends Record<string, unknown>> {
  type: keyof Events
  data: Events[keyof Events]
}

// ---------------------------------------------------------------------------
// Fuzz term (random key generation)
// ---------------------------------------------------------------------------

export interface FuzzTermProvider {
  getState(): FuzzState
  subscribe(listener: (state: FuzzState) => void): () => void
  events(): AsyncIterable<ProviderEvent<{ key: FuzzKeyEvent }>>
  [Symbol.dispose](): void
  readonly history: string[]
}

type FuzzPick<S = Record<string, unknown>> = (
  state: S,
  history: string[],
  random: SeededRandom,
) => string | string[] | Promise<string | string[]>

export interface FuzzTermOptions<S = Record<string, unknown>> {
  keys?: string[]
  count: number
  seed?: number
  pick?: FuzzPick<S>
  cols?: number
  rows?: number
}

function keyFromString(input: string): FuzzKey {
  return {
    upArrow: input === "ArrowUp",
    downArrow: input === "ArrowDown",
    leftArrow: input === "ArrowLeft",
    rightArrow: input === "ArrowRight",
    pageDown: input === "PageDown",
    pageUp: input === "PageUp",
    home: input === "Home",
    end: input === "End",
    return: input === "Enter" || input === "\r",
    escape: input === "Escape" || input === "\x1b",
    ctrl: false,
    shift: input.length === 1 && input >= "A" && input <= "Z",
    tab: input === "Tab" || input === "\t",
    backspace: input === "Backspace" || input === "\b",
    delete: input === "Delete" || input === "\x7f",
    meta: false,
  }
}

export function createFuzzTerm<S = Record<string, unknown>>(options: FuzzTermOptions<S>): FuzzTermProvider {
  const { keys, count, seed = Date.now(), pick, cols = 80, rows = 24 } = options

  const random = createSeededRandom(seed)
  const state: FuzzState = { cols, rows }
  const listeners = new Set<(state: FuzzState) => void>()
  const history: string[] = []
  let disposed = false

  const defaultPick = (): string => {
    if (!keys || keys.length === 0) {
      throw new Error("createFuzzTerm: must provide either keys or pick")
    }
    return keys[Math.floor(random.float() * keys.length)]!
  }

  return {
    getState(): FuzzState {
      return state
    },

    subscribe(listener: (state: FuzzState) => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    async *events(): AsyncGenerator<ProviderEvent<{ key: FuzzKeyEvent }>> {
      let generated = 0
      const batch: string[] = []

      while (generated < count && !disposed) {
        let key: string

        if (batch.length > 0) {
          key = batch.shift()!
        } else if (pick) {
          const result = await pick(state as unknown as S, history, random)
          if (Array.isArray(result)) {
            if (result.length === 0) continue
            key = result[0]!
            for (let i = 1; i < result.length; i++) {
              batch.push(result[i]!)
            }
          } else {
            key = result
          }
        } else {
          key = defaultPick()
        }

        history.push(key)
        generated++

        yield {
          type: "key" as const,
          data: { input: key, key: keyFromString(key) },
        }
      }
    },

    get history() {
      return history
    },

    [Symbol.dispose](): void {
      disposed = true
      listeners.clear()
    },
  }
}

// ---------------------------------------------------------------------------
// Replay term (fixed sequence for shrinking/regression)
// ---------------------------------------------------------------------------

export interface ReplayTermProvider {
  getState(): FuzzState
  subscribe(listener: (state: FuzzState) => void): () => void
  events(): AsyncIterable<ProviderEvent<{ key: FuzzKeyEvent }>>
  [Symbol.dispose](): void
  readonly sequence: string[]
}

export interface ReplayTermOptions {
  cols?: number
  rows?: number
}

export function createReplayTerm(sequence: string[], options: ReplayTermOptions = {}): ReplayTermProvider {
  const { cols = 80, rows = 24 } = options
  const state: FuzzState = { cols, rows }
  const listeners = new Set<(state: FuzzState) => void>()
  let disposed = false

  return {
    getState(): FuzzState {
      return state
    },

    subscribe(listener: (state: FuzzState) => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    async *events(): AsyncGenerator<ProviderEvent<{ key: FuzzKeyEvent }>> {
      for (const key of sequence) {
        if (disposed) break
        yield {
          type: "key" as const,
          data: { input: key, key: keyFromString(key) },
        }
      }
    },

    get sequence() {
      return sequence
    },

    [Symbol.dispose](): void {
      disposed = true
      listeners.clear()
    },
  }
}
