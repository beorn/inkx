/**
 * CwdContext — threads the silvercode app's working directory down to
 * components that need to resolve relative paths into absolute `file://`
 * URIs (LinkifiedText, the OSC 8 hyperlink path).
 *
 * The App mounts a single `<CwdProvider value={props.cwd}>` once at
 * startup. Consumers read via `useCwd()`. Default value is the empty
 * string so isolated test harnesses and headless paths can omit the
 * provider; consumers that need a real cwd skip OSC 8 emission when
 * the value is empty.
 *
 * Why a context (and not a prop drilled through every render path):
 * `LinkifiedText` is invoked from `MarkdownView`, `ChatBlockList`,
 * `InlinePermissionPrompt`, and `AvailableCommandsPalette` — threading
 * cwd through every caller chain bloats every props type for one piece
 * of notification session state.
 */

import React, { createContext, useContext } from "react"

const CwdCtx = createContext<string>("")

export function useCwd(): string {
  return useContext(CwdCtx)
}

export function CwdProvider({ value, children }: { value: string; children: React.ReactNode }): React.ReactElement {
  return <CwdCtx.Provider value={value}>{children}</CwdCtx.Provider>
}
