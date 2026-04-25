/**
 * React hook — live view of background tasks for one session.
 *
 * Subscribes to the controller's onBackgroundTasksChange and returns the
 * current task list. Consumers bind this to BackgroundPane / SidePanel's
 * Background row so the indicator updates within 100ms of Ctrl+B (a single
 * subscribe + setState round-trip).
 */

import { useEffect, useState } from "react"
import type { BackgroundTask, Controller } from "../controller.ts"

export function useBackgroundTasks(controller: Controller, sessionId: string): ReadonlyArray<BackgroundTask> {
  const [tasks, setTasks] = useState<ReadonlyArray<BackgroundTask>>(() =>
    sessionId ? controller.backgroundTasks(sessionId) : [],
  )
  useEffect(() => {
    if (!sessionId) {
      setTasks([])
      return undefined
    }
    const unsub = controller.onBackgroundTasksChange((sid, t) => {
      if (sid === sessionId) setTasks(t)
    })
    setTasks(controller.backgroundTasks(sessionId))
    return unsub
  }, [controller, sessionId])
  return tasks
}
