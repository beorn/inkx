/**
 * Toast notification system - Sonner-inspired API for TUI
 *
 * Provides a simple toast queue for showing temporary notifications
 * with optional actions (like undo). API inspired by Sonner for future
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
  duration?: number // milliseconds (default 10000)
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
 *
 * Disposable: clears all timers on dispose (use `using` for automatic cleanup).
 */
export interface ToastQueue extends Disposable {
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

  // Convenience methods (Sonner-inspired)
  info(message: string, options?: ToastOptions): string
  success(message: string, options?: ToastOptions): string
  warning(message: string, options?: ToastOptions): string
  error(message: string, options?: ToastOptions): string
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
  const batchTimers = new Map<string, ReturnType<typeof setTimeout>>()
  const dismissTimers = new Map<string, ReturnType<typeof setTimeout>>()

  function scheduleDismiss(id: string, duration: number): void {
    // eslint-disable-next-line promise/prefer-await-to-callbacks -- setTimeout requires callback
    const timer = setTimeout(() => {
      dismissTimers.delete(id)
      toasts = toasts.filter((t) => t.id !== id)
    }, duration)
    dismissTimers.set(id, timer)
  }

  return {
    push(level, message, opts) {
      const id = `toast-${nextId++}`
      const toast: Toast = {
        id,
        level,
        message,
        duration: 10_000,
        dismissible: true,
        ...opts,
      }

      // Handle batching
      if (toast.batchKey) {
        handleBatch(toast)
      } else {
        toasts.push(toast)
      }

      // Auto-dismiss after duration
      if (toast.duration && toast.duration > 0) {
        scheduleDismiss(id, toast.duration)
      }

      return id
    },

    dismiss(id) {
      toasts = toasts.filter((t) => t.id !== id)
      const timer = dismissTimers.get(id)
      if (timer) {
        clearTimeout(timer)
        dismissTimers.delete(id)
      }
    },

    dismissAll() {
      toasts = []
      // Clear all batch timers
      for (const timer of batchTimers.values()) {
        clearTimeout(timer)
      }
      batchTimers.clear()
      // Clear all dismiss timers
      for (const timer of dismissTimers.values()) {
        clearTimeout(timer)
      }
      dismissTimers.clear()
    },

    getAll() {
      return [...toasts]
    },

    getLatest() {
      return toasts[toasts.length - 1] ?? null
    },

    // Convenience methods
    info(message, opts) {
      return this.push("info", message, opts)
    },
    success(message, opts) {
      return this.push("success", message, opts)
    },
    warning(message, opts) {
      return this.push("warning", message, opts)
    },
    error(message, opts) {
      return this.push("error", message, opts)
    },

    [Symbol.dispose]() {
      this.dismissAll()
    },
  }

  // Internal helper functions
  function handleBatch(toast: Toast): void {
    if (!toast.batchKey) return

    const key = toast.batchKey

    // Cancel existing batch timer
    const existingTimer = batchTimers.get(key)
    if (existingTimer) {
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
    // eslint-disable-next-line promise/prefer-await-to-callbacks -- setTimeout requires callback
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
