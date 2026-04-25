/**
 * React hook — live view of the pending queue buffer for one session.
 *
 * Subscribes to the controller's onQueueChange and returns the current
 * text. Consumers bind this to a TextArea (the queue editor) and flow
 * edits back via controller.setQueuedText.
 */

import { useEffect, useState } from "react"
import type { Controller } from "../controller.ts"

export function useQueue(controller: Controller, sessionId: string): string {
  // Empty sessionId (e.g. during the startup window where App renders before
  // the first session is attached) → always returns empty. The hook still
  // runs unconditionally, which matches React's rules.
  const [text, setText] = useState<string>(() => (sessionId ? controller.queuedText(sessionId) : ""))
  useEffect(() => {
    if (!sessionId) {
      setText("")
      return undefined
    }
    const unsub = controller.onQueueChange((sid, t) => {
      if (sid === sessionId) setText(t)
    })
    setText(controller.queuedText(sessionId))
    return unsub
  }, [controller, sessionId])
  return text
}
