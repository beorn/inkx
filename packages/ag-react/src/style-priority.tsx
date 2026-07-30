import React, { createContext, useContext, useMemo, type ReactNode } from "react"
import type { BoxProps, TextProps } from "@silvery/ag/types"

export interface StylePriority {
  readonly foreground?: TextProps["color"]
  readonly background?: BoxProps["backgroundColor"]
}

export const StylePriorityContext = createContext<StylePriority | null>(null)

export function StylePriorityProvider({
  foreground,
  background,
  children,
}: StylePriority & { readonly children: ReactNode }): React.ReactElement {
  const parent = useContext(StylePriorityContext)
  const value = useMemo(
    () => ({
      foreground: foreground ?? parent?.foreground,
      background: background ?? parent?.background,
    }),
    [background, foreground, parent],
  )
  return <StylePriorityContext.Provider value={value}>{children}</StylePriorityContext.Provider>
}
