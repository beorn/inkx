/**
 * Job Runner - Background operation runner with toast-based progress and cancel support.
 *
 * Jobs show a countdown toast (with cancel option), then execute with progress,
 * then show a success toast on completion.
 */

import type { ToastQueue } from "./toast.ts"

// Type declarations for global timer functions
declare global {
  function setInterval(callback: () => void, ms: number): number
  function clearInterval(id: number): void
}

export interface JobSpec {
  description: string
  impact: string
  countdownMs?: number // default 5000, 0 = immediate
  execute: (onProgress: (current: number, total: number) => void) => void
  cancel?: () => void
}

export interface JobHandle {
  /** Cancel the job during its countdown phase */
  cancel(): void
}

export interface JobRunner {
  submit(spec: JobSpec): JobHandle
}

export function createJobRunner(toastQueue: ToastQueue): JobRunner {
  return {
    submit(spec) {
      const countdownMs = spec.countdownMs ?? 5000

      if (countdownMs === 0) {
        executeJob(toastQueue, spec)
        return { cancel() {} }
      }

      // Countdown phase
      let remaining = Math.ceil(countdownMs / 1000)
      let cancelled = false

      function cancel() {
        if (cancelled) return
        cancelled = true
        clearInterval(interval)
        toastQueue.dismiss(currentToastId)
        spec.cancel?.()
      }

      let currentToastId = toastQueue.push("info", `${spec.description} — ${spec.impact} (${remaining}s)`, {
        duration: 0,
        action: { label: "Cancel", trigger: cancel },
      })

      const interval = setInterval(() => {
        remaining--
        if (remaining <= 0) {
          clearInterval(interval)
          if (!cancelled) {
            toastQueue.dismiss(currentToastId)
            executeJob(toastQueue, spec)
          }
          return
        }
        // Update countdown message by replacing toast
        toastQueue.dismiss(currentToastId)
        currentToastId = toastQueue.push("info", `${spec.description} — ${spec.impact} (${remaining}s)`, {
          duration: 0,
          action: { label: "Cancel", trigger: cancel },
        })
      }, 1000)

      return { cancel }
    },
  }
}

function executeJob(toastQueue: ToastQueue, spec: JobSpec): void {
  let currentToastId = toastQueue.push("info", `${spec.description}...`, {
    duration: 0,
  })

  spec.execute((current, total) => {
    toastQueue.dismiss(currentToastId)
    currentToastId = toastQueue.push("info", `${spec.description}... (${current}/${total})`, { duration: 0 })
  })

  toastQueue.dismiss(currentToastId)
  toastQueue.success(`${spec.description} — done`)
}
