/**
 * Subscriber
 *
 * Base class for event subscribers (agents, watchers, etc.)
 */

import { EventEmitter } from "events";
import type { Event, EventType } from "../node/types.ts";
import { getEventHub, type EventFilter, type EventHandler } from "./hub.ts";

export interface SubscriberConfig {
  id: string;
  name?: string;
  eventTypes?: EventType[];
  filter?: EventFilter;
}

/**
 * Subscriber - Base class for event consumers
 *
 * Provides:
 * - Automatic subscription management
 * - Event filtering by type
 * - Start/stop lifecycle
 */
export class Subscriber extends EventEmitter {
  protected id: string;
  protected name: string;
  protected eventTypes?: EventType[];
  protected customFilter?: EventFilter;
  protected unsubscribe?: () => void;
  protected running = false;

  constructor(config: SubscriberConfig) {
    super();
    this.id = config.id;
    this.name = config.name ?? config.id;
    this.eventTypes = config.eventTypes;
    this.customFilter = config.filter;
  }

  /**
   * Start listening to events
   */
  start(): void {
    if (this.running) {
      return;
    }

    const hub = getEventHub();

    // Build combined filter
    const filter: EventFilter = (event) => {
      // Check event type filter
      if (this.eventTypes && !this.eventTypes.includes(event.type)) {
        return false;
      }

      // Check custom filter
      if (this.customFilter && !this.customFilter(event)) {
        return false;
      }

      return true;
    };

    // Subscribe
    this.unsubscribe = hub.subscribe(
      this.id,
      (event) => void this.handleEvent(event),
      filter,
    );

    this.running = true;
    this.emit("started");
  }

  /**
   * Stop listening to events
   */
  stop(): void {
    if (!this.running) {
      return;
    }

    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = undefined;
    }

    this.running = false;
    this.emit("stopped");
  }

  /**
   * Handle incoming event
   * Override in subclass
   */
  protected async handleEvent(event: Event): Promise<void> {
    this.emit("event", event);
  }

  /**
   * Get subscriber ID
   */
  getId(): string {
    return this.id;
  }

  /**
   * Get subscriber name
   */
  getName(): string {
    return this.name;
  }

  /**
   * Check if running
   */
  isRunning(): boolean {
    return this.running;
  }
}

/**
 * Create a simple subscriber with a handler function
 */
export function createSubscriber(
  id: string,
  handler: EventHandler,
  config?: Partial<SubscriberConfig>,
): Subscriber {
  const subscriber = new Subscriber({
    id,
    ...config,
  });

  subscriber.on("event", (event: Event) => void handler(event));

  return subscriber;
}
