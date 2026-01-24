/**
 * ChaosWatcher
 *
 * Drop-in replacement for file watchers (chokidar) that supports
 * programmatic event injection and chaos simulation.
 */

import { EventEmitter } from "events";
import { dirname } from "path";
import { statSync } from "fs";
import type {
  IChaosWatcher,
  ChaosWatcherConfig,
  FsEvent,
  ScheduledEvent,
  ChaosScenario,
  EventTiming,
  ServiceStatus,
} from "./types.ts";
import { applyScenario } from "./scenarios.ts";
import { SeededRandom } from "./seeded-random.ts";

const DEFAULT_CONFIG: ChaosWatcherConfig = {
  debounceMs: 100,
  virtualTime: true,
};

export class ChaosWatcher extends EventEmitter implements IChaosWatcher {
  private config: ChaosWatcherConfig;
  private _vaultPath: string = "";
  private _status: ServiceStatus = "stopped";
  private pendingEvents: ScheduledEvent[] = [];
  private emittedEvents: FsEvent[] = [];
  private droppedEvents: FsEvent[] = [];
  private inFlightWrites: Set<string> = new Set();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private random: SeededRandom;
  private scenario: ChaosScenario | null = null;
  private virtualTime: number = 0;
  private useVirtualTime: boolean;
  private scheduledTimers: Array<{ time: number; callback: () => void }> = [];
  private eventBatch: ScheduledEvent[] = [];

  constructor(config: Partial<ChaosWatcherConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.random = new SeededRandom(config.seed ?? Date.now());
    this.useVirtualTime = this.config.virtualTime ?? true;
    if (config.scenario) {
      this.scenario = config.scenario;
    }
    if (config.vaultPath) {
      this._vaultPath = config.vaultPath;
    }
  }

  /** Current lifecycle status */
  get status(): ServiceStatus {
    return this._status;
  }

  /** Vault path being watched */
  get vaultPath(): string {
    return this._vaultPath;
  }

  // ─────────────────────────────────────────────────────────────
  // WatcherInterface Implementation
  // ─────────────────────────────────────────────────────────────

  /**
   * Start the watcher.
   * @param vaultPath - Optional path to watch (uses config.vaultPath if not provided)
   */
  async start(vaultPath?: string): Promise<void> {
    if (this._status !== "stopped") {
      return;
    }

    this._status = "starting";

    if (vaultPath) {
      this._vaultPath = vaultPath;
    }

    // Handle init gap scenario
    if (this.scenario?.type === "init_gap") {
      const params = this.scenario.params as { initDurationMs: number };
      const initDuration = params.initDurationMs ?? 2000;

      if (this.useVirtualTime) {
        this.scheduleVirtual(initDuration, () => {
          this._status = "running";
          this.emit("ready");
        });
      } else {
        setTimeout(() => {
          this._status = "running";
          this.emit("ready");
        }, initDuration);
      }
    } else {
      this._status = "running";
      // Immediate ready for most scenarios
      setImmediate(() => this.emit("ready"));
    }
  }

  async stop(): Promise<void> {
    if (this._status !== "running" && this._status !== "starting") {
      return;
    }

    this._status = "stopping";

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.pendingEvents = [];
    this.scheduledTimers = [];

    this._status = "stopped";
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.stop();
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

  inject(event: FsEvent, timing?: EventTiming): void {
    const scheduled: ScheduledEvent = {
      ...event,
      timing,
      originalIndex: this.emittedEvents.length + this.pendingEvents.length,
    };

    let events = [scheduled];
    if (this.scenario) {
      events = applyScenario([scheduled], this.scenario, this.random);
    }
    if (this.config.eventTransformer) {
      events = this.config.eventTransformer(events);
    }

    for (const evt of events) {
      this.scheduleEvent(evt);
    }
  }

  injectEvents(events: FsEvent[]): void {
    for (const event of events) {
      this.inject(event);
    }
  }

  injectBatch(events: FsEvent[]): void {
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
    this.emit("sync", {
      paths: [],
      directories: [this.vaultPath],
      overflow: true,
    });
  }

  simulateFsEventsFlagMustScanSubDirs(dirPath: string): void {
    this.emit("sync", {
      paths: [],
      directories: [dirPath],
      mustScanSubDirs: true,
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Time Manipulation
  // ─────────────────────────────────────────────────────────────

  async advanceTime(ms: number): Promise<void> {
    if (!this.useVirtualTime) {
      await new Promise((r) => setTimeout(r, ms));
      return;
    }

    const targetTime = this.virtualTime + ms;

    while (this.scheduledTimers.length > 0) {
      this.scheduledTimers.sort((a, b) => a.time - b.time);

      const next = this.scheduledTimers[0]!;
      if (next.time > targetTime) {
        break;
      }

      this.scheduledTimers.shift();
      this.virtualTime = next.time;
      next.callback();
    }

    this.virtualTime = targetTime;
  }

  async flush(): Promise<void> {
    if (this.useVirtualTime) {
      // In virtual time mode, run all scheduled timers (which process events)
      // Clear pending events tracking since timers will process them
      this.pendingEvents = [];
      const timers = [...this.scheduledTimers];
      this.scheduledTimers = [];
      for (const timer of timers) {
        timer.callback();
      }
    } else {
      // In real time mode, process pending events directly
      const events = [...this.pendingEvents];
      this.pendingEvents = [];

      for (const evt of events) {
        if (evt.timing?.drop) {
          this.droppedEvents.push(evt);
        } else {
          this.processEvent(evt);
        }
      }
    }

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

  getVirtualTime(): number {
    return this.virtualTime;
  }

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
      this.pendingEvents.push(event);
      this.scheduleVirtual(delay, () => {
        this.processEvent(event);
      });
    } else {
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
    if (this.inFlightWrites.has(event.path)) {
      return;
    }

    const duplicates = event.timing?.duplicates ?? 1;
    const duplicateDelay = event.timing?.duplicateDelay ?? 0;

    for (let i = 0; i < duplicates; i++) {
      if (i > 0 && duplicateDelay > 0 && !this.useVirtualTime) {
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
      if (event.type === "addDir" || event.type === "unlinkDir") {
        dirs.add(event.path);
      } else if (event.type === "change") {
        // Check if the path is actually a directory (FSEvents coalescing)
        try {
          const stat = statSync(event.path);
          if (stat.isDirectory()) {
            dirs.add(event.path);
          } else {
            dirs.add(dirname(event.path));
          }
        } catch {
          dirs.add(dirname(event.path));
        }
      } else {
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
 * Create a ChaosWatcher with common test defaults
 */
export function createChaosWatcher(
  options: Partial<ChaosWatcherConfig> = {},
): ChaosWatcher {
  return new ChaosWatcher({
    debounceMs: 50,
    seed: 12345,
    virtualTime: true,
    ...options,
  });
}
