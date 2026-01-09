/**
 * Event Hub
 *
 * Pub/sub system for event distribution
 */

import { EventEmitter } from "events";
import type { Event } from "../node/types.ts";

export type EventFilter = (event: Event) => boolean;
export type EventHandler = (event: Event) => void | Promise<void>;

export interface Subscription {
  id: string;
  filter?: EventFilter;
  handler: EventHandler;
}

/**
 * EventHub - Central event distribution system
 *
 * Features:
 * - Subscribe to all events or filtered subsets
 * - Async handler support
 * - Event replay from cursor
 */
export class EventHub extends EventEmitter {
  private subscriptions: Map<string, Subscription> = new Map();
  private eventLog: Event[] = [];
  private maxLogSize = 1000; // Keep last N events in memory

  constructor() {
    super();
  }

  /**
   * Publish an event to all subscribers
   */
  async publish(event: Event): Promise<void> {
    // Add to memory log
    this.eventLog.push(event);
    if (this.eventLog.length > this.maxLogSize) {
      this.eventLog.shift();
    }

    // Emit for generic listeners
    this.emit("event", event);
    this.emit(event.type, event);

    // Notify subscribers
    const promises: Promise<void>[] = [];

    for (const sub of this.subscriptions.values()) {
      if (!sub.filter || sub.filter(event)) {
        const result = sub.handler(event);
        if (result instanceof Promise) {
          promises.push(result);
        }
      }
    }

    // Wait for all async handlers
    if (promises.length > 0) {
      await Promise.all(promises);
    }
  }

  /**
   * Subscribe to events
   */
  subscribe(
    id: string,
    handler: EventHandler,
    filter?: EventFilter
  ): () => void {
    this.subscriptions.set(id, { id, handler, filter });

    // Return unsubscribe function
    return () => {
      this.subscriptions.delete(id);
    };
  }

  /**
   * Unsubscribe by ID
   */
  unsubscribe(id: string): boolean {
    return this.subscriptions.delete(id);
  }

  /**
   * Get recent events from memory log
   */
  getRecentEvents(limit: number = 100): Event[] {
    return this.eventLog.slice(-limit);
  }

  /**
   * Get events since a cursor (event ID)
   */
  getEventsSince(cursor: string): Event[] {
    const index = this.eventLog.findIndex((e) => e.id === cursor);
    if (index === -1) {
      return [];
    }
    return this.eventLog.slice(index + 1);
  }

  /**
   * Clear the event log
   */
  clearLog(): void {
    this.eventLog = [];
  }

  /**
   * Get subscription count
   */
  getSubscriptionCount(): number {
    return this.subscriptions.size;
  }

  /**
   * List all subscriptions
   */
  listSubscriptions(): string[] {
    return [...this.subscriptions.keys()];
  }
}

// Singleton instance
let hubInstance: EventHub | null = null;

/**
 * Get the global event hub instance
 */
export function getEventHub(): EventHub {
  if (!hubInstance) {
    hubInstance = new EventHub();
  }
  return hubInstance;
}

/**
 * Reset the global event hub (for testing)
 */
export function resetEventHub(): void {
  if (hubInstance) {
    hubInstance.removeAllListeners();
  }
  hubInstance = new EventHub();
}
