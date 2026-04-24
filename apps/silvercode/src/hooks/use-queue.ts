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
  const [text, setText] = useState<string>(() => controller.queuedText(sessionId))
  useEffect(() => {
    const unsub = controller.onQueueChange((sid, t) => {
      if (sid === sessionId) setText(t)
    })
    // Re-sync in case the value changed before we subscribed.
    setText(controller.queuedText(sessionId))
    return unsub
  }, [controller, sessionId])
  return text
}
