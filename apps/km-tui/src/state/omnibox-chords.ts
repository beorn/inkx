/**
 * Omnibox Enter-chord interpretation (km-tui.omnibox-interactions, Phase 7).
 *
 * Pure mapping from a keyboard chord to the omnibox's intent on Enter.
 * Keeps the chord rules out of the connector/component code so they can
 * be unit-tested without rendering, and so other dispatchers (mouse
 * binding, AI automation) can reuse the same intent vocabulary.
 *
 * The connector consumes the resulting `EnterIntent` and routes:
 *
 *   - `run-default` — the existing path: resolve effectiveCommand
 *     against the highlighted row.
 *   - `force-create-at` (Shift+Enter) — bypass row kind detection,
 *     run `create_at` against the buffer / selectedArgument.
 *   - `force-goto` (Ctrl+Enter) — bypass row kind detection, run
 *     `goto` against selectedArgument.
 *   - `force-verb` (Ctrl+{g,m,a,l,c}+Enter) — direct verb override.
 */

/**
 * The chord pressed when Enter fires. Filled in by the keybinding layer.
 * `verbKey` is the simultaneously-held letter when Ctrl is held — `g`,
 * `m`, `a`, `l`, or `c`. Anything else falls back to `force-goto`.
 */
export interface EnterChord {
  shift: boolean
  ctrl: boolean
  /** Cmd / Super on Mac. Currently unused by chord rules but reserved. */
  meta: boolean
  /** When ctrl is held with a verb letter, the letter pressed. */
  verbKey?: string
}

/** What the omnibox should do for the current Enter event. */
export type EnterIntent =
  | { kind: "run-default" }
  | { kind: "force-create-at" }
  | { kind: "force-goto" }
  | { kind: "force-verb"; commandId: string }

const VERB_LETTER_TO_COMMAND: Readonly<Record<string, string>> = Object.freeze({
  g: "goto",
  m: "move",
  a: "add",
  l: "add_link",
  c: "capture_inbox",
})

/**
 * Map a chord to the omnibox intent.
 *
 * Precedence (highest first):
 *   1. Shift → `force-create-at` (matches the binary "create-here vs goto"
 *      split most apps establish: Shift = "do it differently".)
 *   2. Ctrl + recognized verb letter → `force-verb` with the verb's id.
 *   3. Ctrl alone (or Ctrl+unknown letter) → `force-goto`.
 *   4. Otherwise → `run-default`.
 *
 * Shift wins over Ctrl when both are held; the user's primary intent for
 * Shift+Enter is "create at this target" which is independent of any
 * navigation override Ctrl would have implied.
 */
export function interpretEnter(chord: EnterChord): EnterIntent {
  if (chord.shift) return { kind: "force-create-at" }
  if (chord.ctrl) {
    const verb = chord.verbKey ? VERB_LETTER_TO_COMMAND[chord.verbKey] : undefined
    if (verb) return { kind: "force-verb", commandId: verb }
    return { kind: "force-goto" }
  }
  return { kind: "run-default" }
}
