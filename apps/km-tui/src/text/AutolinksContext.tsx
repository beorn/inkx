/**
 * AutolinksContext — threads loaded autolink rules down to <InlinePlainText/>.
 *
 * Mirrors the pattern in silvercode's AutolinksContext.tsx: a single
 * <AutolinksProvider rules={…}> at app startup, consumed by the inline
 * renderer via `useAutolinks()` to detect rule-driven patterns inside
 * plain-text runs.
 *
 * Consumers that aren't wrapped in a provider get an empty rule list —
 * autolinks gracefully degrade to "no extra detections" rather than
 * crashing. That keeps tests, isolated harnesses, and the non-interactive
 * CLI path (which doesn't load config) all happy.
 */

import React, { createContext, useContext, useMemo } from "react"
import type { AutolinkRule } from "@km/autolinks"

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
  // Memoize the value object so consumers don't re-render every time
  // the App re-renders. Rules are loaded once at startup; their identity
  // is stable across the session.
  const value = useMemo<AutolinksContextValue>(() => ({ rules }), [rules])
  return <AutolinksCtx.Provider value={value}>{children}</AutolinksCtx.Provider>
}
