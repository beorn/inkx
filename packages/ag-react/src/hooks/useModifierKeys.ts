/**
 * useModifierKeys — track held modifier key state.
 *
 * Returns which modifier keys (Cmd/Super, Ctrl, Alt, Shift) are currently held.
 * Tracks state from key events via Kitty protocol. The default Kitty flags
 * (DISAMBIGUATE | REPORT_EVENTS | REPORT_ALL_KEYS) enable modifier-only
 * press/release detection — no special configuration needed.
 *
 * The `enabled` option controls subscription — when false, the component
 * never re-renders from modifier changes. Use this to avoid re-rendering
 * many components when only one needs modifier state (e.g., only the
 * hovered link subscribes).
 *
 * @example
 * ```tsx
 * function Link({ href, children }) {
 *   const [hovered, setHovered] = useState(false)
 *   // Only subscribe when hovered — zero cost for non-hovered links
 *   const { super: cmdHeld } = useModifierKeys({ enabled: hovered })
 *   const revealed = hovered && cmdHeld
 *   return <Text underline="dotted" color={revealed ? "$fg" : "$fg-link"} onMouseEnter={() => setHovered(true)} ...>
 * }
 * ```
 */

import { useContext, useMemo, useSyncExternalStore } from "react"
import { ChainAppContext, type ChainAppContextValue } from "../context"
import type { Key } from "@silvery/ag/keys"

/**
 * Match `Key.modifierName` against a specific modifier role. The
 * modifier-state store uses these helpers to drop the matching flag on
 * release — Kitty keeps the modifier bit set in the release sequence
 * (e.g. `\x1b[57444;9:3u` for left-super release), so reading
 * `key.super` verbatim wouldn't tell the store which modifier dropped.
 */
function isSuperKey(name: string | undefined): boolean {
  return name === "leftsuper" || name === "rightsuper"
}

function isCtrlKey(name: string | undefined): boolean {
  return name === "leftcontrol" || name === "rightcontrol"
}

function isAltKey(name: string | undefined): boolean {
  // Alt and Meta share the same store flag (`alt`) — releasing either
  // drops it. Hyper has its own representation in `key.hyper` but no
  // store field today; track it as alt for forward-compat with the
  // existing surface.
  return name === "leftalt" || name === "rightalt" || name === "leftmeta" || name === "rightmeta"
}

function isShiftKey(name: string | undefined): boolean {
  return name === "leftshift" || name === "rightshift"
}

// ============================================================================
// Types
// ============================================================================

export interface ModifierState {
  /** Super/Cmd key (macOS Cmd, requires Kitty protocol) */
  super: boolean
  /** Ctrl key */
  ctrl: boolean
  /** Alt/Option key */
  alt: boolean
  /** Shift key */
  shift: boolean
}

export interface UseModifierKeysOptions {
  /**
   * Enable or disable subscription to modifier changes.
   * When false, returns the current snapshot but never triggers re-renders.
   * @default true
   */
  enabled?: boolean
}

// ============================================================================
// Global Singleton Store (per runtime)
// ============================================================================

const INITIAL: ModifierState = { super: false, ctrl: false, alt: false, shift: false }

/**
 * Last known modifier state (global, updated by any runtime's modifier store).
 * Read this from imperative code (event handlers, TEA update functions)
 * that can't use the useModifierKeys React hook.
 */
export let lastModifierState: Readonly<ModifierState> = INITIAL

interface ModifierStore {
  subscribe: (cb: () => void) => () => void
  getSnapshot: () => ModifierState
}

const chainStores = new WeakMap<ChainAppContextValue, ModifierStore>()

function buildStore(
  subscribeInput: (handler: (_input: string, key: Key) => void) => () => void,
  subscribeFocus: (handler: (focused: boolean) => void) => () => void,
): ModifierStore {
  let state = INITIAL
  const listeners = new Set<() => void>()

  function notify() {
    for (const cb of listeners) cb()
  }

  subscribeInput((_input, key) => {
    // Modifier-key release events keep the modifier bit set on the parsed
    // key (real terminals emit `\x1b[57444;9:3u` — super still in
    // modifiers byte 9 when the release fires). Reading `key.super`
    // verbatim would leave the store thinking Cmd is held forever once
    // pressed. Detect modifier-only release events and drop the matching
    // flag explicitly. Bead: @km/silvery/keydown-keyup-test-primitives.
    let next: ModifierState
    if (key.eventType === "release" && key.modifierName) {
      next = {
        super: state.super && !isSuperKey(key.modifierName),
        ctrl: state.ctrl && !isCtrlKey(key.modifierName),
        alt: state.alt && !isAltKey(key.modifierName),
        shift: state.shift && !isShiftKey(key.modifierName),
      }
    } else {
      next = {
        super: !!key.super,
        ctrl: !!key.ctrl,
        alt: !!key.meta,
        shift: !!key.shift,
      }
    }
    if (
      next.super !== state.super ||
      next.ctrl !== state.ctrl ||
      next.alt !== state.alt ||
      next.shift !== state.shift
    ) {
      state = next
      lastModifierState = next
      notify()
    }
  })

  subscribeFocus((focused) => {
    if (!focused && (state.super || state.ctrl || state.alt || state.shift)) {
      state = INITIAL
      lastModifierState = INITIAL
      notify()
    }
  })

  return {
    subscribe: (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    getSnapshot: () => state,
  }
}

function getOrCreateChainStore(chain: ChainAppContextValue): ModifierStore {
  let store = chainStores.get(chain)
  if (store) return store
  // useModifierKeys needs unfiltered key events — including release and
  // modifier-only — so subscribe to the chain's raw-key observer, not the
  // fallback input store (which filters release/modifier-only).
  store = buildStore(
    (h) => chain.rawKeys.register((input, key) => h(input, key as Key)),
    (h) => chain.focusEvents.register(h),
  )
  chainStores.set(chain, store)
  return store
}

/**
 * Read the current modifier state imperatively (outside React).
 * For use in event handlers, TEA update functions, etc.
 *
 * Accepts a {@link ChainAppContextValue} — the canonical subscription
 * surface after the TEA Phase 2 wiring. Returns {@link INITIAL} when the
 * chain has no cached modifier store yet.
 */
export function getModifierState(chain: ChainAppContextValue | null | undefined): ModifierState {
  if (!chain) return INITIAL
  const store = chainStores.get(chain)
  return store ? store.getSnapshot() : INITIAL
}

// ============================================================================
// No-op subscribe (for disabled state)
// ============================================================================

const noopUnsubscribe = () => {}
const noopSubscribe = (_cb: () => void) => noopUnsubscribe

// ============================================================================
// Hook
// ============================================================================

/**
 * Track which modifier keys are currently held.
 *
 * When `enabled` is false, the hook returns the current snapshot but does
 * not subscribe to changes — the component never re-renders from modifier
 * key events. This enables the "only the hovered element subscribes" pattern.
 */
// TODO: When silvery state is signal-based, derive `armed` as a computed signal
// (hovered && cmdHeld) so the Link component never re-renders — only the
// underline style subscription triggers a targeted repaint.
export function useModifierKeys(opts?: UseModifierKeysOptions): ModifierState {
  const enabled = opts?.enabled ?? true
  const chain = useContext(ChainAppContext)

  // Memoize the store instance (stable across renders for same chain app).
  // No chain (static mode, no runtime) → null → returns INITIAL.
  const store = useMemo(() => {
    if (chain) return getOrCreateChainStore(chain)
    return null
  }, [chain])

  return useSyncExternalStore(
    enabled && store ? store.subscribe : noopSubscribe,
    store ? store.getSnapshot : () => INITIAL,
    () => INITIAL, // server snapshot
  )
}
