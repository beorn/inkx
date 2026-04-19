/**
 * Handle "link:open" events from silvery Link components.
 *
 * When a Link is Cmd+clicked, it emits "link:open" via the silvery
 * apply-chain's custom-events bus (see `withCustomEvents`). This hook
 * subscribes to that event and opens URLs using the OS default handler.
 * Internal URLs (km:// scheme) are dispatched to the board for navigation.
 */

import { useContext, useEffect } from "react"
import { ChainAppContext } from "@silvery/ag-react/context"

/** Open a URL using the OS default handler. */
function openExternal(href: string): void {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open"
  Bun.spawn([cmd, href], { stdout: "ignore", stderr: "ignore" })
}

/**
 * Subscribe to "link:open" events and handle URL opening.
 *
 * @param onInternalLink - Callback for internal links (km:// scheme).
 *   If not provided, internal links are ignored.
 */
export function useLinkOpen(onInternalLink?: (href: string) => void): void {
  const chain = useContext(ChainAppContext)

  useEffect(() => {
    if (!chain) return
    return chain.events.on("link:open", (href: unknown) => {
      if (typeof href !== "string") return
      if (href.startsWith("http://") || href.startsWith("https://")) {
        openExternal(href)
      } else if (href.startsWith("km://") && onInternalLink) {
        onInternalLink(href)
      }
    })
  }, [chain, onInternalLink])
}
