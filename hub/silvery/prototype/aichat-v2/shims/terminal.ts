/**
 * Shim for @silvery/ag-term.
 * Production: terminal surface adapter that owns the input loop.
 */

import type { ReactElement } from "react"
import { createApp, type AppHandle } from "@silvery/create/create-app"
import type { Key } from "@silvery/ag-term/runtime"
import { invoke, type Mapping } from "./commands.js"

function normalizeKey(input: string, key: Key): string {
  if (key.escape) return "escape"
  if (key.ctrl) return `ctrl+${input}`
  return input
}

export async function withTerminal({
  view,
  keys,
  mode = "inline",
  focusReporting = true,
}: {
  view: ReactElement
  keys?: Mapping<string>
  mode?: "inline" | "fullscreen"
  focusReporting?: boolean
}): Promise<AppHandle<Record<string, unknown>>> {
  const app = createApp(() => () => ({}), {
    "term:key": (data) => {
      const { input, key } = data as { input: string; key: Key }
      const keyStr = normalizeKey(input, key)
      const inv = keys?.(keyStr)
      if (inv) invoke(inv)
    },
  })

  return app.run(view, { mode, focusReporting })
}
