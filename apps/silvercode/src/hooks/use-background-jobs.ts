/**
 * React hook — live view of background jobs for one session.
 *
 * Subscribes to the controller's onBackgroundJobsChange and returns the
 * current job list. Consumers bind this to BackgroundJobsPane / SidePanel's
 * Background row so the indicator updates within 100ms of Ctrl+B (a single
 * subscribe + setState round-trip).
 */

import { useEffect, useState } from "react"
import type { BackgroundJob, Controller } from "../controller.ts"

export function useBackgroundJobs(
  controller: Controller | null | undefined,
  sessionId: string,
): ReadonlyArray<BackgroundJob> {
  const [jobs, setJobs] = useState<ReadonlyArray<BackgroundJob>>(() =>
    controller && sessionId ? controller.backgroundJobs(sessionId) : [],
  )
  useEffect(() => {
    if (!controller || !sessionId) {
      setJobs([])
      return undefined
    }
    const unsub = controller.onBackgroundJobsChange((sid, nextJobs) => {
      if (sid === sessionId) setJobs(nextJobs)
    })
    setJobs(controller.backgroundJobs(sessionId))
    return unsub
  }, [controller, sessionId])
  return jobs
}
