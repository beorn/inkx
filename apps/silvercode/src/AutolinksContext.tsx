/**
 * AutolinksContext — threads loaded autolink rules + preview runtime down
 * to `<LinkifiedText/>`.
 *
 * The context value is read-only from the consumer's perspective. The App
 * mounts a single `<AutolinksProvider rules={…}>` once at startup; any
 * `<LinkifiedText/>` deeper in the tree picks rules up via `useAutolinks()`.
 *
 * Consumers that aren't wrapped in a provider get an empty rule list —
 * autolinks gracefully degrade to "no extra detections" rather than
 * crashing. That keeps tests, isolated harnesses, and the live-spawn path
 * (which doesn't load config) all happy.
 *
 * The provider owns a session-local preview runtime. That runtime owns
 * its cache, fs.watch handles, and debounce timers; `useScopeEffect`
 * registers the runtime disposer on the App's root scope so one provider
 * cannot clear another provider's preview state.
 */

import React, { createContext, useContext, useMemo } from "react"
import { useScopeEffect } from "silvery"
import { createPreviewRuntime, type AutolinkRule, type PreviewRuntime } from "@km/autolinks"

export type AutolinksContextValue = {
  readonly rules: readonly AutolinkRule[]
  readonly previewRuntime: PreviewRuntime
}

const EMPTY_RUNTIME = createPreviewRuntime()
const EMPTY: AutolinksContextValue = { rules: [], previewRuntime: EMPTY_RUNTIME }

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
  const previewRuntime = useMemo(() => createPreviewRuntime(), [])
  const value = useMemo<AutolinksContextValue>(() => ({ rules, previewRuntime }), [rules, previewRuntime])

  // Tear down preview fs.watch handles and debounce timers when the
  // provider unmounts (or when the surrounding scope is disposed by
  // SIGINT/SIGTERM). Empty deps for the runtime lifetime.
  useScopeEffect(
    (scope) => {
      scope.defer(() => previewRuntime.dispose())
    },
    [previewRuntime],
  )

  return <AutolinksCtx.Provider value={value}>{children}</AutolinksCtx.Provider>
}
