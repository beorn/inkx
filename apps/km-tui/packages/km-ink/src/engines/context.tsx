/**
 * Engine Context
 *
 * Provides engine-specific view components to the Board component tree.
 */

import React, { createContext, useContext } from "react";
import type { TuiEngine } from "../types.ts";

// Import inkx views (for inkx and inkx-flexx engines)
import { ColumnsView } from "../views/ColumnsView.tsx";
import { ListView } from "../views/ListView.tsx";
import { TabsView } from "../views/TabsView.tsx";
import { Column } from "../views/CardColumn.tsx";

/**
 * View components provided by the engine
 */
export interface EngineViews {
  ColumnsView: typeof ColumnsView;
  ListView: typeof ListView;
  TabsView: typeof TabsView;
  Column: typeof Column;
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
      ColumnsView,
      ListView,
      TabsView,
      Column,
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
 * Get views for a specific engine (inkx and inkx-flexx use the same views)
 */
function getViewsForEngine(_engine: TuiEngine): EngineViews {
  return {
    ColumnsView,
    ListView,
    TabsView,
    Column,
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
