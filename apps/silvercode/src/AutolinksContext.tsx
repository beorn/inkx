/**
 * AutolinksContext — threads loaded autolink rules + the preview cache
 * down to `<DetectionText/>`.
 *
 * The context value is read-only from the consumer's perspective. The App
 * mounts a single `<AutolinksProvider rules={…}>` once at startup; any
 * `<DetectionText/>` deeper in the tree picks rules up via `useAutolinks()`.
 *
 * Consumers that aren't wrapped in a provider get an empty rule list —
 * autolinks gracefully degrade to "no extra detections" rather than
 * crashing. That keeps tests, isolated harnesses, and the live-spawn path
 * (which doesn't load config) all happy.
 */

import React, { createContext, useContext, useMemo } from "react"
import type { AutolinkRule } from "./autolinks/config.ts"

export type AutolinksContextValue = {
  readonly rules: readonly AutolinkRule[]
}

const EMPTY: AutolinksContextValue = { rules: [] }

const AutolinksCtx = createContext<AutolinksContextValue>(EMPTY)

export function useAutolinks(): AutolinksContextValue {
  return useContext(AutolinksCtx)
}

export function AutolinksProvider({
  rules,
  children,
}: {
  rules: readonly AutolinkRule[]
  children: React.ReactNode
}): React.ReactElement {
  // Memoize the value object so consumers don't re-render every time the
  // App re-renders. Rules are loaded once at startup; their identity is
  // stable across the session.
  const value = useMemo<AutolinksContextValue>(() => ({ rules }), [rules])
  return <AutolinksCtx.Provider value={value}>{children}</AutolinksCtx.Provider>
}
