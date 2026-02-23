/**
 * PaneContext — provides pane ID to descendant components.
 *
 * Each pane in a multi-pane workspace wraps its Board in a PaneIdProvider.
 * Board and its children use usePaneId() to know which pane they belong to,
 * enabling per-pane state isolation (reading from workspace.panes.get(paneId)).
 *
 * Default value "main" matches the single-pane case (no provider needed).
 */

import React, { createContext, useContext } from "react"

const PaneContext = createContext<string>("main")

export function PaneIdProvider({ value, children }: { value: string; children: React.ReactNode }): React.ReactElement {
  return <PaneContext.Provider value={value}>{children}</PaneContext.Provider>
}

export function usePaneId(): string {
  return useContext(PaneContext)
}
