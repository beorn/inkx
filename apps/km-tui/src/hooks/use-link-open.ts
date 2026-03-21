/**
 * Handle "link:open" events from silvery Link components.
 *
 * When a Link is Cmd+clicked, it emits "link:open" via RuntimeContext.
 * This hook subscribes to that event and opens URLs using the OS default handler.
 * Internal URLs (km:// scheme) are dispatched to the board for navigation.
 */

import { useEffect } from "react"
import { useRuntime, type BaseRuntimeEvents } from "@silvery/react"

interface LinkEvents extends BaseRuntimeEvents {
  "link:open": [href: string]
}

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
  const rt = useRuntime<LinkEvents>()

  useEffect(() => {
    if (!rt) return
    return rt.on("link:open", (href: string) => {
      if (href.startsWith("http://") || href.startsWith("https://")) {
        openExternal(href)
      } else if (href.startsWith("km://") && onInternalLink) {
        onInternalLink(href)
      }
    })
  }, [rt, onInternalLink])
}
