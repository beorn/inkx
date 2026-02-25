/**
 * PaneContext — provides pane ID and display label to descendant components.
 *
 * Each pane in a multi-pane workspace wraps its Board in a PaneIdProvider.
 * Board and its children use usePaneId() to know which pane they belong to,
 * enabling per-pane state isolation (reading from workspace.panes.get(paneId)).
 *
 * PaneLabelProvider gives each pane its display label (e.g., "1", "2", "1d").
 * Board reads this to integrate the label into its own top bar in multi-pane mode.
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

// Pane label — null in single-pane mode, "1"/"2"/"1d" in multi-pane mode
const PaneLabelContext = createContext<string | null>(null)

export function PaneLabelProvider({
  value,
  children,
}: {
  value: string
  children: React.ReactNode
}): React.ReactElement {
  return <PaneLabelContext.Provider value={value}>{children}</PaneLabelContext.Provider>
}

export function usePaneLabel(): string | null {
  return useContext(PaneLabelContext)
}
