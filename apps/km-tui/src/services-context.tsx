/**
 * Services Context — Stable service references via React Context.
 *
 * Services (toastQueue, jobRunner, undoHandle) are set once at app init
 * and never change. React context is the right primitive for stable DI —
 * no signals or store subscriptions needed.
 */

import React, { createContext, useContext, type ReactNode } from "react"
import type { ToastQueue, JobRunner } from "@km/core"
import type { UndoableRepoHandle } from "./undo/undoable-repo.ts"

// =============================================================================
// Context + hooks
// =============================================================================

interface ServicesContextValue {
  toastQueue: ToastQueue
  jobRunner: JobRunner
  undoHandle: UndoableRepoHandle
}

const ServicesContext = createContext<ServicesContextValue | null>(null)

function useServices(): ServicesContextValue {
  const ctx = useContext(ServicesContext)
  if (!ctx) throw new Error("useServices: not inside ServicesProvider")
  return ctx
}

export function useToastQueue(): ToastQueue {
  return useServices().toastQueue
}

export function useJobRunner(): JobRunner {
  return useServices().jobRunner
}

export function useUndoHandle(): UndoableRepoHandle {
  return useServices().undoHandle
}

// =============================================================================
// Provider
// =============================================================================

export function ServicesProvider({
  toastQueue,
  jobRunner,
  undoHandle,
  children,
}: ServicesContextValue & { children: ReactNode }) {
  const value = React.useMemo(() => ({ toastQueue, jobRunner, undoHandle }), [toastQueue, jobRunner, undoHandle])
  return <ServicesContext.Provider value={value}>{children}</ServicesContext.Provider>
}
