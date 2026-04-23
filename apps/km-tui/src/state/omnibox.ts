/* eslint-disable @typescript-eslint/no-non-null-assertion -- codebase idiom: arr[i]! / map.get(k)! / stack.pop()! after surrounding length/has/bounds check; TS noUncheckedIndexedAccess requires the assertion even when invariant is obvious */
/**
 * Omnibox — normalized types and contracts (Phase 1 of km-tui.omnibox-unified).
 *
 * Canonical source of truth: docs/design/omnibox.md
 *
 * The omnibox is one unified sigil-dispatched search/command surface that
 * replaces the legacy Omnibox / ItemPicker / FavoritesDialog / SearchDialog /
 * FindBar stack. This module defines only the pure data types and pure
 * functions (state → derived value) — no React, no store, no side effects.
 *
 * See the design doc for the "why" behind the subject/target split and the
 * ID-based selectedArgument field.
 */

/** Sigil-dispatched search mode, derived from the leading char of the buffer. */
export type OmniboxMode = "command" | "context" | "tag" | "project" | "node" | "local_find" | "universal"

/**
 * Canonical sigil → mode map. Matches docs/design/omnibox.md.
 *
 * `[` means "regular nodes (non-tasks) only". The parser additionally
 * recognizes bracket-task forms (`[]`, `[ ]`, `[x]`, `[/]`, `[!]`, `[-]`)
 * at the start of the buffer and sets `ParsedQuery.taskFilter` — those
 * don't conflict with the `[`-sigil because the parser consumes the
 * bracket token first. Typing a bare `[` (or `[foo`) remains in node
 * mode and is resolved to the non-task filter in `passesSigilFilter`.
 */
export const SIGIL_MODES: Readonly<Record<string, OmniboxMode>> = Object.freeze({
  ":": "command",
  "@": "context",
  "#": "tag",
  "+": "project",
  "[": "node",
  "/": "local_find",
})

/**
 * Base state — the 3 fields the omnibox reducer mutates. Everything else is
 * derived from these or frozen in the invocation spec.
 */
export interface OmniboxBaseState {
  /** Single working buffer — leading char is the sigil. */
  buffer: string

  /**
   * Sticky default command — always set. `"default"` is the universal initial
   * value; the `default` command does type-dispatch at execute time (command
   * → run, else → goto).
   *
   * Mutated by: opening chord / initial spec, or user arrowing over a command
   * result while in `:`-mode. Preserved when the user is NOT in `:`-mode.
   *
   * NOTE: `effectiveCommand(state)` is what the executor uses; typing `/`
   * derives `local_find` without touching this field so backspace-through-`/`
   * trivially restores the prior command.
   */
  defaultCommand: string

  /**
   * Sticky argument — stored as an **ID**, not a KNode object. The actual
   * node is looked up through the repo at render / execute time. Keeps the
   * state serializable and eliminates object-identity bugs across reranks,
   * deletes, and repo-query churn.
   *
   * Mutated by: opening chord with a pre-seeded subject, or user arrowing
   * over a non-command result while NOT in `:`-mode. Preserved when the
   * user IS in `:`-mode.
   */
  selectedArgumentId: string | null
}

/**
 * Subject snapshot — frozen at open time from the anchor pane. The subject
 * is the "acted-on" node for binary verbs (`move`, `add`, `add_link`).
 * Freezing it at open time means the omnibox session stays coherent even
 * if the anchor pane mutates during the session.
 */
export interface OmniboxSubjectSelection {
  /** The anchor pane's cursor at open time (or null if the pane had no cursor). */
  cursorId: string | null
  /** The anchor pane's full selection at open time (empty if none). */
  selectedIds: readonly string[]
}

/**
 * Invocation spec — immutable per-session config. Everything here is frozen
 * at `openOmnibox(spec)` call time and never mutated by the reducer.
 */
export interface OmniboxInvocationSpec {
  /** Initial buffer. Examples: ":", "", "/", "@", "#". */
  initialBuffer: string
  /** Initial sticky defaultCommand. Default: "default". */
  initialDefaultCommand: string
  /** Initial sticky argument ID (cursor pre-select). */
  initialArgumentId: string | null
  /** The pane the omnibox is anchored to. Focus returns here on dismiss. */
  anchorPaneId: string
  /** Frozen anchor-pane selection — the *subject* for binary verbs. */
  subjectSelection: OmniboxSubjectSelection
  /**
   * Pre-scoped candidate provider. The caller decides what's in scope;
   * the omnibox never knows about "favorites" or "current-view" as flags.
   */
  candidateProvider: () => readonly import("@km/core").KNode[]
}

/**
 * Resolved Enter invocation — the data the command executor consumes on
 * `OMNIBOX_CONFIRM`. The executor plumbs `subjectSelection` into
 * `ctx.currentNodeId` / `ctx.selectedNodes` and `argumentId` into
 * `ctx.targetId`. Binary verbs read both; unary verbs ignore the subject.
 */
export interface OmniboxEnterInvocation {
  /** The effective command to run. */
  commandId: string
  /** Target node ID — the thing the user picked in the omnibox. */
  argumentId: string | null
  /** Buffer text verbatim. Commands like `capture_inbox` that create new
   *  nodes read this as the new node's title. */
  buffer: string
  /** Subject — the frozen anchor-pane selection, passed through from the
   *  invocation spec. */
  subject: OmniboxSubjectSelection
}

// ---------------------------------------------------------------------------
// Pure derived functions
// ---------------------------------------------------------------------------

/**
 * Which search mode a buffer is in, based on its leading sigil.
 * Empty buffer (or unknown leading char) → `"universal"`.
 */
export function modeOf(buffer: string): OmniboxMode {
  if (buffer.length === 0) return "universal"
  return SIGIL_MODES[buffer[0]!] ?? "universal"
}

/**
 * Resolve the effective command: the `/` sigil derives `local_find` at
 * read-time without mutating `defaultCommand`. Backspacing through `/`
 * restores the sticky command with zero reducer work.
 */
export function resolveEffectiveCommand(state: OmniboxBaseState): string {
  if (state.buffer.startsWith("/")) return "local_find"
  return state.defaultCommand
}

/** Build the Enter invocation that the command executor will consume. */
export function resolveEnterInvocation(state: OmniboxBaseState, spec: OmniboxInvocationSpec): OmniboxEnterInvocation {
  return {
    commandId: resolveEffectiveCommand(state),
    argumentId: state.selectedArgumentId,
    buffer: state.buffer,
    subject: spec.subjectSelection,
  }
}

/**
 * Build the initial reducer state from an invocation spec. The reducer
 * never constructs state directly — always through this factory, so the
 * "always set defaultCommand" invariant holds.
 */
export function initialStateFromSpec(spec: OmniboxInvocationSpec): OmniboxBaseState {
  return {
    buffer: spec.initialBuffer,
    defaultCommand: spec.initialDefaultCommand || "default",
    selectedArgumentId: spec.initialArgumentId,
  }
}

// ---------------------------------------------------------------------------
// OmniboxPane — the value object stored in UIState.omnibox (Phase 5)
// ---------------------------------------------------------------------------

/**
 * Value object that couples the base state with its frozen invocation spec.
 * This is what lives in `UIState.omnibox` while an omnibox is open.
 *
 * Separating mutable `state` from immutable `spec` keeps reducers focused
 * on the 3-field base state while the spec (anchorPaneId, subjectSelection,
 * candidateProvider) stays constant for the whole session.
 */
export interface OmniboxPane {
  readonly spec: OmniboxInvocationSpec
  /** The 3-field mutable base state. Reducer actions rewrite this field. */
  state: OmniboxBaseState
}

/**
 * Construct a fresh `OmniboxPane` from a spec. This is what
 * `openOmnibox(setUI, spec)` passes to `setUI({ omnibox: ... })` to raise
 * a new singleton omnibox overlay.
 */
export function createOmniboxPane(spec: OmniboxInvocationSpec): OmniboxPane {
  return { spec, state: initialStateFromSpec(spec) }
}

/**
 * The omnibox's cursor — the node ID it is currently pointing at, updated
 * as the user arrows through results. Reads `state.selectedArgumentId`.
 *
 * This is the single TEA-shim boundary for Phase 6 (km-tui.omnibox-cursor):
 * the app-wide `currentCursor()` delegates here when the omnibox is open,
 * so commands reading `ctx.currentNodeId` act on whatever row the user
 * last highlighted. The command executor is the only caller — commands
 * themselves must not reach into `OmniboxBaseState`.
 */
export function omniboxCursor(pane: OmniboxPane): string | null {
  return pane.state.selectedArgumentId
}

/**
 * The UIState-setter signature. We inject it via DI so the omnibox helpers
 * stay independent of Zustand / signal store plumbing and can be tested
 * against a plain mock. In production this is `BoardAppStore["setUI"]`.
 */
export type SetUIFn = (patch: { omnibox: OmniboxPane | null }) => void

/**
 * Raise a singleton overlay omnibox from an invocation spec. Replaces any
 * currently-open omnibox (we only ever have one at a time). Focus return
 * on dismiss is the caller's responsibility via `spec.anchorPaneId`.
 */
export function openOmnibox(setUI: SetUIFn, spec: OmniboxInvocationSpec): OmniboxPane {
  const pane = createOmniboxPane(spec)
  setUI({ omnibox: pane })
  return pane
}

/** Dismiss the current omnibox overlay. No-op if already null. */
export function dismissOmnibox(setUI: SetUIFn): void {
  setUI({ omnibox: null })
}

/**
 * Dispatch an action against the current pane and write the result back
 * through setUI. This is the full reducer loop for a single tick — the
 * caller (usually a key handler) doesn't need to touch the pane directly.
 */
export function dispatchOmnibox(
  setUI: SetUIFn,
  currentPane: OmniboxPane | null,
  action: OmniboxAction,
): OmniboxPane | null {
  if (currentPane == null) return null
  const next = omniboxReduce(currentPane, action)
  setUI({ omnibox: next })
  return next
}

/**
 * Pure reducer action: update the base state of an existing OmniboxPane.
 * Returns a new pane with the same spec and a replaced state. Keep the
 * reducer pure — the caller writes the result back via setUI.
 */
export function withUpdatedState(pane: OmniboxPane, next: OmniboxBaseState): OmniboxPane {
  return { spec: pane.spec, state: next }
}

/**
 * Minimal omnibox reducer. Pure: `(pane, action) → pane`. The caller
 * dispatches via `setUI({ omnibox: omniboxReduce(ui.omnibox, action) })`.
 */
export type OmniboxAction =
  | { type: "SET_BUFFER"; buffer: string }
  | { type: "TYPE_CHAR"; char: string }
  | { type: "SET_DEFAULT_COMMAND"; commandId: string }
  | { type: "SET_SELECTED_ARGUMENT"; argumentId: string | null }
  | { type: "SWITCH_TO_COMMANDS" } // cmd-k while open
  | { type: "SWITCH_TO_ARGUMENT" } // cmd-f while open
  | { type: "CLEAR_ALL" }

export function omniboxReduce(pane: OmniboxPane, action: OmniboxAction): OmniboxPane {
  const s = pane.state
  switch (action.type) {
    case "SET_BUFFER":
      return withUpdatedState(pane, { ...s, buffer: action.buffer })
    case "TYPE_CHAR":
      return withUpdatedState(pane, { ...s, buffer: applySigilRule(s.buffer, action.char) })
    case "SET_DEFAULT_COMMAND":
      return withUpdatedState(pane, { ...s, defaultCommand: action.commandId })
    case "SET_SELECTED_ARGUMENT":
      return withUpdatedState(pane, { ...s, selectedArgumentId: action.argumentId })
    case "SWITCH_TO_COMMANDS":
      // cmd-k: force :-mode, preserve sticky argument.
      return withUpdatedState(pane, { ...s, buffer: ":" })
    case "SWITCH_TO_ARGUMENT":
      // cmd-f: force universal mode, preserve sticky defaultCommand.
      return withUpdatedState(pane, { ...s, buffer: "" })
    case "CLEAR_ALL":
      // Triggered on CANCEL or on CONFIRM in pane form.
      return withUpdatedState(pane, {
        ...s,
        buffer: "",
        selectedArgumentId: null,
      })
  }
}

// ---------------------------------------------------------------------------
// Sigil auto-replace rule (asymmetric — only `:` is slippery)
// ---------------------------------------------------------------------------

/**
 * Compute the new buffer when the user types a character at position 0
 * (the sigil slot). Asymmetric per /pro: **only `:` is slippery**.
 *
 * - Current buffer starts with `:` and the typed char is a different sigil
 *   → replace the leading `:` with the typed sigil, preserving the tail.
 *   Example: `":cr"` + user types `@` → `"@cr"`.
 *
 * - Current buffer starts with `:` and the typed char is a letter
 *   → append normally. Example: `":cr"` + `"a"` → `":cra"`.
 *
 * - Current buffer starts with a **content** sigil (`@ # + [`) and the
 *   user types another character (sigil or letter) → append normally.
 *   Content sigils are sticky literals. Explicit mode changes go through
 *   `cmd-k` / `cmd-f`, not typing.
 *
 * - Empty buffer + any char → buffer becomes that char.
 */
export function applySigilRule(buffer: string, typed: string): string {
  if (typed.length !== 1) return buffer + typed
  if (buffer.length === 0) return typed

  const leading = buffer[0]!
  const isSigil = typed in SIGIL_MODES
  const isColonSlippery = leading === ":" && isSigil && typed !== ":"
  if (isColonSlippery) return typed + buffer.slice(1)

  return buffer + typed
}
