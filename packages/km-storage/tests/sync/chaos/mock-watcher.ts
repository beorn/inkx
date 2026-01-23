/**
 * Mock Watcher
 *
 * Drop-in replacement for FileSystemWatcher/WorkerWatcher that supports
 * programmatic event injection and chaos simulation.
 */

import { EventEmitter } from "events";
import { dirname } from "path";
import { statSync } from "fs";
import type {
  IMockWatcher,
  MockWatcherConfig,
  FsEvent,
  ScheduledEvent,
  ChaosScenario,
  EventTiming,
} from "./types.ts";
import { applyScenario } from "./scenario-transformer.ts";
import { SeededRandom } from "./seeded-random.ts";

const DEFAULT_CONFIG: MockWatcherConfig = {
  debounceMs: 100, // Faster for tests
};

export class MockWatcher extends EventEmitter implements IMockWatcher {
  private config: MockWatcherConfig;
  private vaultPath: string = "";
  private isStarted: boolean = false;
  private pendingEvents: ScheduledEvent[] = [];
  private emittedEvents: FsEvent[] = [];
  private droppedEvents: FsEvent[] = [];
  private inFlightWrites: Set<string> = new Set();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private random: SeededRandom;
  private scenario: ChaosScenario | null = null;
  private virtualTime: number = 0;
  private useVirtualTime: boolean = false;
  private scheduledTimers: Array<{ time: number; callback: () => void }> = [];
  private eventBatch: ScheduledEvent[] = [];

  constructor(config: Partial<MockWatcherConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.random = new SeededRandom(config.seed ?? Date.now());
    if (config.scenario) {
      this.scenario = config.scenario;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Standard Watcher Interface
  // ─────────────────────────────────────────────────────────────

  start(vaultPath: string): void {
    this.vaultPath = vaultPath;
    this.isStarted = true;

    // Handle init gap scenario
    if (this.scenario?.type === "init_gap") {
      const params = this.scenario.params as { initDurationMs: number };
      const initDuration = params.initDurationMs ?? 2000;

      if (this.useVirtualTime) {
        this.scheduleVirtual(initDuration, () => {
          this.emit("ready");
        });
      } else {
        setTimeout(() => {
          this.emit("ready");
        }, initDuration);
      }
    } else {
      // Immediate ready for most scenarios
      setImmediate(() => this.emit("ready"));
    }
  }

  async stop(): Promise<void> {
    this.isStarted = false;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.pendingEvents = [];
    this.scheduledTimers = [];
  }

  markInFlight(path: string): void {
    this.inFlightWrites.add(path);
  }

  clearInFlight(path: string, delayMs: number = 0): void {
    if (delayMs > 0) {
      if (this.useVirtualTime) {
        this.scheduleVirtual(delayMs, () => this.inFlightWrites.delete(path));
      } else {
        setTimeout(() => this.inFlightWrites.delete(path), delayMs);
      }
    } else {
      this.inFlightWrites.delete(path);
    }
  }

  isInFlight(path: string): boolean {
    return this.inFlightWrites.has(path);
  }

  forceSync(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.emitSync();
  }

  // ─────────────────────────────────────────────────────────────
  // Chaos Injection Methods
  // ─────────────────────────────────────────────────────────────

  injectEvent(event: FsEvent, timing?: EventTiming): void {
    const scheduled: ScheduledEvent = {
      ...event,
      timing,
      originalIndex: this.emittedEvents.length + this.pendingEvents.length,
    };

    // Apply scenario transformation
    let events = [scheduled];
    if (this.scenario) {
      events = applyScenario([scheduled], this.scenario, this.random);
    }

    // Apply custom transformer
    if (this.config.eventTransformer) {
      events = this.config.eventTransformer(events);
    }

    for (const evt of events) {
      this.scheduleEvent(evt);
    }
  }

  injectEvents(events: FsEvent[]): void {
    for (const event of events) {
      this.injectEvent(event);
    }
  }

  injectBatch(events: FsEvent[]): void {
    // Apply scenario to entire batch at once
    let scheduled: ScheduledEvent[] = events.map((e, i) => ({
      ...e,
      originalIndex: i,
    }));

    if (this.scenario) {
      scheduled = applyScenario(scheduled, this.scenario, this.random);
    }

    if (this.config.eventTransformer) {
      scheduled = this.config.eventTransformer(scheduled);
    }

    for (const evt of scheduled) {
      this.scheduleEvent(evt);
    }
  }

  setScenario(scenario: ChaosScenario): void {
    this.scenario = scenario;
  }

  clearScenario(): void {
    this.scenario = null;
  }

  simulateQueueOverflow(): void {
    // Emit the IN_Q_OVERFLOW equivalent
    // System should do a full directory scan in response
    this.emit("sync", {
      paths: [],
      directories: [this.vaultPath],
      overflow: true,
    });
  }

  simulateFsEventsFlagMustScanSubDirs(dirPath: string): void {
    // macOS FSEvents flag indicating subdirectory rescan needed
    this.emit("sync", {
      paths: [],
      directories: [dirPath],
      mustScanSubDirs: true,
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Time Manipulation
  // ─────────────────────────────────────────────────────────────

  /**
   * Enable virtual time mode for deterministic testing
   */
  enableVirtualTime(): void {
    this.useVirtualTime = true;
    this.virtualTime = 0;
  }

  /**
   * Advance virtual time and process events that should fire
   */
  async advanceTime(ms: number): Promise<void> {
    if (!this.useVirtualTime) {
      // In real time mode, just wait
      await new Promise((r) => setTimeout(r, ms));
      return;
    }

    const targetTime = this.virtualTime + ms;

    // Process scheduled timers in order
    while (this.scheduledTimers.length > 0) {
      // Sort by time
      this.scheduledTimers.sort((a, b) => a.time - b.time);

      const next = this.scheduledTimers[0];
      if (next.time > targetTime) {
        break;
      }

      this.scheduledTimers.shift();
      this.virtualTime = next.time;
      next.callback();
    }

    this.virtualTime = targetTime;
  }

  /**
   * Process all pending events immediately
   */
  async flush(): Promise<void> {
    // Process all pending events, respecting drops
    const events = [...this.pendingEvents];
    this.pendingEvents = [];

    for (const evt of events) {
      if (evt.timing?.drop) {
        this.droppedEvents.push(evt);
      } else {
        await this.processEvent(evt);
      }
    }

    // Also run any pending timers
    if (this.useVirtualTime) {
      const timers = [...this.scheduledTimers];
      this.scheduledTimers = [];
      for (const timer of timers) {
        timer.callback();
      }
    }

    // Force emit accumulated batch
    this.emitSync();
  }

  // ─────────────────────────────────────────────────────────────
  // Introspection
  // ─────────────────────────────────────────────────────────────

  getPendingEvents(): ScheduledEvent[] {
    return [...this.pendingEvents];
  }

  getEmittedEvents(): FsEvent[] {
    return [...this.emittedEvents];
  }

  getDroppedEvents(): FsEvent[] {
    return [...this.droppedEvents];
  }

  /**
   * Get current virtual time (if in virtual time mode)
   */
  getVirtualTime(): number {
    return this.virtualTime;
  }

  /**
   * Reset all state for a fresh test
   */
  reset(): void {
    this.pendingEvents = [];
    this.emittedEvents = [];
    this.droppedEvents = [];
    this.eventBatch = [];
    this.inFlightWrites.clear();
    this.scheduledTimers = [];
    this.virtualTime = 0;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Private Methods
  // ─────────────────────────────────────────────────────────────

  private scheduleEvent(event: ScheduledEvent): void {
    if (event.timing?.drop) {
      this.droppedEvents.push(event);
      return;
    }

    const delay = event.timing?.delay ?? 0;

    if (this.useVirtualTime) {
      // In virtual time mode, queue for later processing
      this.pendingEvents.push(event);
      this.scheduleVirtual(delay, () => {
        this.processEvent(event);
      });
    } else {
      // In real time mode
      if (delay > 0) {
        setTimeout(() => this.processEvent(event), delay);
      } else {
        setImmediate(() => this.processEvent(event));
      }
    }
  }

  private scheduleVirtual(delayMs: number, callback: () => void): void {
    this.scheduledTimers.push({
      time: this.virtualTime + delayMs,
      callback,
    });
  }

  private processEvent(event: ScheduledEvent): void {
    // Skip in-flight writes (our own writes)
    if (this.inFlightWrites.has(event.path)) {
      return;
    }

    // Handle duplicates
    const duplicates = event.timing?.duplicates ?? 1;
    const duplicateDelay = event.timing?.duplicateDelay ?? 0;

    for (let i = 0; i < duplicates; i++) {
      if (i > 0 && duplicateDelay > 0 && !this.useVirtualTime) {
        // In real time, actually wait
        setTimeout(() => this.recordEvent(event), duplicateDelay * i);
      } else {
        this.recordEvent(event);
      }
    }
  }

  private recordEvent(event: FsEvent): void {
    this.emittedEvents.push(event);
    this.eventBatch.push(event as ScheduledEvent);
    this.scheduleSync();
  }

  private scheduleSync(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    if (this.useVirtualTime) {
      this.scheduleVirtual(this.config.debounceMs, () => {
        this.emitSync();
      });
    } else {
      this.debounceTimer = setTimeout(() => {
        this.emitSync();
      }, this.config.debounceMs);
    }
  }

  private emitSync(): void {
    if (this.eventBatch.length === 0) {
      return;
    }

    const paths = this.eventBatch.map((e) => e.path);
    const dirs = new Set<string>();

    for (const event of this.eventBatch) {
      // For directory events (addDir, unlinkDir), include the path itself
      if (event.type === "addDir" || event.type === "unlinkDir") {
        dirs.add(event.path);
      } else if (event.type === "change") {
        // For change events, check if the path is actually a directory
        // This handles FSEvents coalescing where file events become dir events
        try {
          const stat = statSync(event.path);
          if (stat.isDirectory()) {
            dirs.add(event.path);
          } else {
            dirs.add(dirname(event.path));
          }
        } catch {
          // Path doesn't exist, use parent directory
          dirs.add(dirname(event.path));
        }
      } else {
        // For other file events (add, unlink), scan the parent directory
        dirs.add(dirname(event.path));
      }
    }

    this.eventBatch = [];
    this.debounceTimer = null;

    this.emit("sync", {
      paths,
      directories: [...dirs],
    });
  }
}

/**
 * Create a mock watcher with common test defaults
 */
export function createMockWatcher(
  options: Partial<MockWatcherConfig> = {},
): MockWatcher {
  const watcher = new MockWatcher({
    debounceMs: 50, // Fast for tests
    seed: 12345, // Reproducible
    ...options,
  });
  watcher.enableVirtualTime();
  return watcher;
}
