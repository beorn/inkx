/**
 * Lifecycle counters — module-level observables for the spike.
 *
 * Real React hooks (useEffect, useInput) fire side effects that we want
 * to observe from the test without adding extra React state. These
 * counters live in module scope and are reset at the start of each test
 * via `resetCounters()`. The `App` component in `App.tsx` increments
 * them via `useEffect` + render-time logging.
 *
 * ## What we measure (and why)
 *
 *   - `renders`                — how often the root component's body ran
 *                                 (one per React render commit).
 *   - `inputHandlerRegistrations`
 *                              — how many times `useInput`'s internal
 *                                 `chain.input.register(...)` callback
 *                                 was installed. Duplicate registrations
 *                                 after mount/unmount cycles are a
 *                                 known-dangerous regression.
 *   - `inputHandlerDisposals`  — matching disposal count; should always
 *                                 equal `inputHandlerRegistrations - liveCount`.
 *   - `focusEnters` / `focusExits`
 *                              — every time focus transitions onto/off
 *                                 the dialog scope. Used to assert that
 *                                 focus returns to prior scope after close.
 *   - `dialogOpens` / `dialogCloses`
 *                              — state transitions observed by the
 *                                 component. Diverging from the key
 *                                 transcript is a symptom of missed
 *                                 or duplicated dispatches.
 *   - `keyEvents`              — a tagged log of every key the top-level
 *                                 handler saw. We assert shape here:
 *                                 `{ input, ctrl, escape, return, ... }`.
 *   - `reentrantErrors`        — caught errors from the apply chain
 *                                 guard (`Reentrant dispatch`). Must
 *                                 remain 0.
 *
 * ## Why module-level rather than React state?
 *
 * We're specifically trying to observe lifecycle *outside* React state,
 * because bugs like "double registration after unmount" are invisible to
 * a re-render-driven counter — they manifest as ghost subscriptions on
 * the chainApp that survive the component tree. Closure/module scope is
 * the right lane.
 */

export interface KeyEvent {
  input: string
  ctrl: boolean
  escape: boolean
  return: boolean
  leftArrow: boolean
  rightArrow: boolean
  backspace: boolean
  shift: boolean
  eventType: string | undefined
}

export interface Counters {
  renders: number
  inputHandlerRegistrations: number
  inputHandlerDisposals: number
  focusEnters: number
  focusExits: number
  dialogOpens: number
  dialogCloses: number
  keyEvents: KeyEvent[]
  reentrantErrors: string[]
}

let counters: Counters = freshCounters()

function freshCounters(): Counters {
  return {
    renders: 0,
    inputHandlerRegistrations: 0,
    inputHandlerDisposals: 0,
    focusEnters: 0,
    focusExits: 0,
    dialogOpens: 0,
    dialogCloses: 0,
    keyEvents: [],
    reentrantErrors: [],
  }
}

export function resetCounters(): void {
  counters = freshCounters()
}

export function get(): Counters {
  return counters
}

export function incRender(): void {
  counters.renders += 1
}

export function incRegistration(): void {
  counters.inputHandlerRegistrations += 1
}

export function incDisposal(): void {
  counters.inputHandlerDisposals += 1
}

export function incFocusEnter(): void {
  counters.focusEnters += 1
}

export function incFocusExit(): void {
  counters.focusExits += 1
}

export function incDialogOpen(): void {
  counters.dialogOpens += 1
}

export function incDialogClose(): void {
  counters.dialogCloses += 1
}

export function recordKey(e: KeyEvent): void {
  counters.keyEvents.push(e)
}

export function recordReentrant(message: string): void {
  counters.reentrantErrors.push(message)
}
