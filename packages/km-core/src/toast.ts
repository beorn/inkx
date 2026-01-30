/**
 * Toast notification system - Sonner-compatible API for TUI
 *
 * Provides a simple toast queue for showing temporary notifications
 * with optional actions (like undo). API mirrors Sonner for future
 * web UI compatibility.
 */

import type { NotificationLevel } from "./types.ts"

// Type declarations for global timer functions
declare global {
  function setTimeout(callback: () => void, ms: number): number
  function clearTimeout(id: number): void
}

// =============================================================================
// Toast Types
// =============================================================================

export interface ToastAction {
  label: string
  // For TUI: keyboard shortcut to trigger action
  // For Web: onClick handler
  trigger: string | (() => void)
}

export interface Toast {
  id: string
  level: NotificationLevel
  message: string
  description?: string
  duration?: number // milliseconds (default 4000)
  dismissible?: boolean // default true
  action?: ToastAction
  // For batching similar toasts
  batchKey?: string
  // For grouped toasts: show individual items when count is low
  items?: string[] // e.g., ["file1.md", "file2.md"] for sync toasts
  // Threshold for showing items vs summary (default 3)
  // If items.length < threshold: show all items
  // If items.length >= threshold: show "N items" summary
  itemThreshold?: number
}

export type ToastOptions = Omit<Toast, "id" | "level" | "message">

// =============================================================================
// Toast Queue
// =============================================================================

export interface ToastQueueOptions {
  /** Debounce time for batching similar toasts (default: 100ms) */
  batchDebounce?: number
}

/**
 * ToastQueue interface - simple toast queue with batching support.
 */
export interface ToastQueue {
  /** Add a toast to the queue. Returns toast ID. */
  push(level: NotificationLevel, message: string, options?: ToastOptions): string
  /** Remove a toast by ID */
  dismiss(id: string): void
  /** Remove all toasts */
  dismissAll(): void
  /** Get all current toasts */
  getAll(): Toast[]
  /** Get the most recent toast (for single-toast display) */
  getLatest(): Toast | null
}

/**
 * Create a simple toast queue with batching support.
 * Toasts are stored in order and can be batched by key.
 */
export function createToastQueue(options: ToastQueueOptions = {}): ToastQueue {
  const batchDebounce = options.batchDebounce ?? 100

  // Internal state
  let toasts: Toast[] = []
  let nextId = 1
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const batchTimers = new Map<string, any>()

  return {
    push(level, message, opts) {
      const id = `toast-${nextId++}`
      const toast: Toast = {
        id,
        level,
        message,
        duration: 4000,
        dismissible: true,
        ...opts,
      }

      // Handle batching
      if (toast.batchKey) {
        handleBatch(toast)
      } else {
        toasts.push(toast)
      }

      return id
    },

    dismiss(id) {
      toasts = toasts.filter((t) => t.id !== id)
    },

    dismissAll() {
      toasts = []
      // Clear all batch timers
      for (const timer of batchTimers.values()) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- Timer ID from Map<string, any>
        clearTimeout(timer)
      }
      batchTimers.clear()
    },

    getAll() {
      return [...toasts]
    },

    getLatest() {
      return toasts[toasts.length - 1] ?? null
    },
  }

  // Internal helper functions
  function handleBatch(toast: Toast): void {
    if (!toast.batchKey) return

    const key = toast.batchKey

    // Cancel existing batch timer
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Timer ID from Map<string, any>
    const existingTimer = batchTimers.get(key)
    if (existingTimer) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- Timer ID from Map<string, any>
      clearTimeout(existingTimer)
    }

    // Find existing batched toast
    const existing = toasts.find((t) => t.batchKey === key)

    if (existing) {
      // Update existing batched toast

      // If toast has items array, accumulate them
      if (toast.items && toast.items.length > 0) {
        const existingItems = existing.items ?? []
        existing.items = [...existingItems, ...toast.items]

        // Update message based on threshold
        const threshold = toast.itemThreshold ?? 3
        const totalCount = existing.items.length

        if (totalCount < threshold) {
          // Show individual items
          existing.message = toast.message // Keep base message
        } else {
          // Show summary count
          existing.message = `${totalCount} ${toast.message}`
        }

        existing.itemThreshold = threshold
      } else {
        // No items - just increment count in message
        const count = extractCount(existing.message) + 1
        existing.message = `${count} ${toast.message}`
      }
    } else {
      // First toast with this key
      if (toast.items && toast.items.length > 0) {
        const threshold = toast.itemThreshold ?? 3
        if (toast.items.length < threshold) {
          // Keep original message and items
          toasts.push({ ...toast })
        } else {
          // Show count
          toasts.push({
            ...toast,
            message: `${toast.items.length} ${toast.message}`,
          })
        }
      } else {
        toasts.push({ ...toast, message: `1 ${toast.message}` })
      }
    }

    // Set new batch timer
    const timer = setTimeout(() => {
      batchTimers.delete(key)
    }, batchDebounce)

    batchTimers.set(key, timer)
  }

  function extractCount(message: string): number {
    const match = message.match(/^(\d+)\s/)
    return match?.[1] ? parseInt(match[1], 10) : 1
  }
}

// =============================================================================
// Sonner-compatible API
// =============================================================================

/**
 * Global toast queue instance.
 * In TUI, this is rendered in the toast area above the bottom bar.
 */
export const toastQueue = createToastQueue()

/**
 * Sonner-compatible toast API.
 * Each method returns the toast ID for later manipulation.
 */
export const toast = Object.assign(
  // Default toast (info level)
  (message: string, options?: ToastOptions): string => {
    return toastQueue.push("info", message, options)
  },
  {
    success: (message: string, options?: ToastOptions): string => {
      return toastQueue.push("success", message, options)
    },

    error: (message: string, options?: ToastOptions): string => {
      return toastQueue.push("error", message, options)
    },

    warning: (message: string, options?: ToastOptions): string => {
      return toastQueue.push("warning", message, options)
    },

    info: (message: string, options?: ToastOptions): string => {
      return toastQueue.push("info", message, options)
    },

    dismiss: (id?: string): void => {
      if (id) {
        toastQueue.dismiss(id)
      } else {
        toastQueue.dismissAll()
      }
    },

    // Promise helper (future - not implemented yet)
    promise: <T>(
      _promise: Promise<T>,
      _opts: {
        loading: string
        success: string | ((data: T) => string)
        error: string | ((err: Error) => string)
      },
    ): string => {
      // TODO: Implement promise handling when needed
      throw new Error("toast.promise() not yet implemented")
    },
  },
)
