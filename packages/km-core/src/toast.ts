/**
 * Toast notification system - Sonner-compatible API for TUI
 *
 * Provides a simple toast queue for showing temporary notifications
 * with optional actions (like undo). API mirrors Sonner for future
 * web UI compatibility.
 */

import type { NotificationLevel } from "./types.ts"

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

/**
 * Simple toast queue with batching support.
 * Toasts are stored in order and can be batched by key.
 */
export class ToastQueue {
  private toasts: Toast[] = []
  private nextId = 1
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private batchTimers = new Map<string, any>()
  private batchDebounce = 100 // ms

  /**
   * Add a toast to the queue.
   * If batchKey is provided, similar toasts will be batched.
   */
  push(level: NotificationLevel, message: string, options?: ToastOptions): string {
    const id = `toast-${this.nextId++}`
    const toast: Toast = {
      id,
      level,
      message,
      duration: 4000,
      dismissible: true,
      ...options,
    }

    // Handle batching
    if (toast.batchKey) {
      this.handleBatch(toast)
    } else {
      this.toasts.push(toast)
    }

    return id
  }

  private handleBatch(toast: Toast): void {
    const key = toast.batchKey!

    // Cancel existing batch timer
    const existingTimer = this.batchTimers.get(key)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    // Find existing batched toast
    const existingIndex = this.toasts.findIndex((t) => t.batchKey === key)

    if (existingIndex >= 0) {
      // Update existing batched toast
      const existing = this.toasts[existingIndex]!

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
        const count = this.extractCount(existing.message) + 1
        existing.message = `${count} ${toast.message}`
      }
    } else {
      // First toast with this key
      if (toast.items && toast.items.length > 0) {
        const threshold = toast.itemThreshold ?? 3
        if (toast.items.length < threshold) {
          // Keep original message and items
          this.toasts.push({ ...toast })
        } else {
          // Show count
          this.toasts.push({
            ...toast,
            message: `${toast.items.length} ${toast.message}`
          })
        }
      } else {
        this.toasts.push({ ...toast, message: `1 ${toast.message}` })
      }
    }

    // Set new batch timer
    const timer = setTimeout(() => {
      this.batchTimers.delete(key)
    }, this.batchDebounce)

    this.batchTimers.set(key, timer)
  }

  private extractCount(message: string): number {
    const match = message.match(/^(\d+)\s/)
    return match ? parseInt(match[1], 10) : 1
  }

  /**
   * Remove a toast by ID
   */
  dismiss(id: string): void {
    this.toasts = this.toasts.filter((t) => t.id !== id)
  }

  /**
   * Remove all toasts
   */
  dismissAll(): void {
    this.toasts = []
    // Clear all batch timers
    for (const timer of this.batchTimers.values()) {
      clearTimeout(timer)
    }
    this.batchTimers.clear()
  }

  /**
   * Get all current toasts
   */
  getAll(): Toast[] {
    return [...this.toasts]
  }

  /**
   * Get the most recent toast (for single-toast display)
   */
  getLatest(): Toast | null {
    return this.toasts[this.toasts.length - 1] ?? null
  }
}

// =============================================================================
// Sonner-compatible API
// =============================================================================

/**
 * Global toast queue instance.
 * In TUI, this is rendered in the toast area above the bottom bar.
 */
export const toastQueue = new ToastQueue()

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
    promise: <T,>(
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
