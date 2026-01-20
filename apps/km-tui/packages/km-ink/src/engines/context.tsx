/**
 * Engine Context
 *
 * Provides engine-specific view components to the Board component tree.
 * This allows Board.tsx to work with either ink or inkx views.
 */

import React, { createContext, useContext } from "react";
import type { TuiEngine } from "../types.ts";

// Import inkx views (for inkx and inkx-flexx engines)
import { ColumnsView as InkxColumnsView } from "../views/ColumnsView.tsx";
import { ListView as InkxListView } from "../views/ListView.tsx";
import { TabsView as InkxTabsView } from "../views/TabsView.tsx";
import { Column as InkxColumn } from "../views/CardColumn.tsx";

// Import ink views (for stock ink engine)
import { ColumnsView as InkColumnsView } from "./ink/views/ColumnsView.tsx";
import { ListView as InkListView } from "./ink/views/ListView.tsx";
import { TabsView as InkTabsView } from "./ink/views/TabsView.tsx";
import { Column as InkColumn } from "./ink/views/CardColumn.tsx";

/**
 * View components provided by the engine
 */
export interface EngineViews {
  ColumnsView: typeof InkxColumnsView;
  ListView: typeof InkxListView;
  TabsView: typeof InkxTabsView;
  Column: typeof InkxColumn;
}

/**
 * Engine context value
 */
export interface EngineContextValue {
  engine: TuiEngine;
  views: EngineViews;
}

const EngineContext = createContext<EngineContextValue | null>(null);

/**
 * Hook to get engine-specific views
 */
export function useEngineViews(): EngineViews {
  const context = useContext(EngineContext);
  if (!context) {
    // Default to inkx views if no context (for backwards compatibility)
    return {
      ColumnsView: InkxColumnsView,
      ListView: InkxListView,
      TabsView: InkxTabsView,
      Column: InkxColumn,
    };
  }
  return context.views;
}

/**
 * Hook to get current engine name
 */
export function useEngineName(): TuiEngine {
  const context = useContext(EngineContext);
  return context?.engine ?? "inkx";
}

/**
 * Get views for a specific engine
 */
function getViewsForEngine(engine: TuiEngine): EngineViews {
  if (engine === "ink") {
    // Stock ink views (import from "ink" package)
    return {
      ColumnsView: InkColumnsView,
      ListView: InkListView,
      TabsView: InkTabsView,
      Column: InkColumn,
    };
  }
  // inkx and inkx-flexx use inkx views
  return {
    ColumnsView: InkxColumnsView,
    ListView: InkxListView,
    TabsView: InkxTabsView,
    Column: InkxColumn,
  };
}

/**
 * Provider for engine-specific views
 */
export function EngineProvider({
  engine,
  children,
}: {
  engine: TuiEngine;
  children: React.ReactNode;
}): React.ReactElement {
  const value: EngineContextValue = {
    engine,
    views: getViewsForEngine(engine),
  };

  return (
    <EngineContext.Provider value={value}>{children}</EngineContext.Provider>
  );
}
