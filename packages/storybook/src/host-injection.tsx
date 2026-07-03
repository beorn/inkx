import React, { createContext, useContext, type ReactNode } from "react"

/**
 * Injection seam for the reusable storybook host.
 *
 * The host (runner + chrome + the Story type) is provider-neutral and
 * framework-free so it can ship as a `@silvery/storybook` primitive. A consumer
 * (e.g. an agent workspace or app shell) supplies its own responsive-layout
 * wrappers here: the prose-lane width and the preview pane-cols context. When no
 * injection is provided the host falls back to plain silvery defaults.
 */
export interface StorybookHostInjection {
  /** Wrap a story's prose-lane body in the consumer's prose-width layout. */
  proseLaneWrapper?: (body: ReactNode) => React.ReactElement
  /** Wrap the preview pane in the consumer's responsive pane-cols context. */
  previewWrap?: (node: ReactNode, paneCols: number) => React.ReactElement
}

const StorybookHostInjectionContext = createContext<StorybookHostInjection>({})

export function StorybookHostInjectionProvider({
  value,
  children,
}: {
  value: StorybookHostInjection
  children: ReactNode
}): React.ReactElement {
  return (
    <StorybookHostInjectionContext.Provider value={value}>
      {children}
    </StorybookHostInjectionContext.Provider>
  )
}

export function useStorybookHostInjection(): StorybookHostInjection {
  return useContext(StorybookHostInjectionContext)
}
