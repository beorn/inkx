/**
 * Parse Worker Thread
 *
 * Parses markdown files in a worker thread for parallel processing.
 * km-fast-md.6: Worker pool for parallel parsing
 *
 * Note: Debug output is suppressed in worker threads. Workers don't have
 * access to the main thread's DEBUG_LOG redirection, so debug() would write
 * to stdout. To debug the parser, run it outside the worker context.
 */

// Suppress debug output in worker - it would bypass DEBUG_LOG and go to stdout
// Must be set BEFORE importing modules that use debug()
delete process.env.DEBUG;

import { readFileSync } from "fs";
import { parseMarkdownWithLinks } from "@km/markdown";

export interface ParseRequest {
  type: "parse";
  id: number;
  fsPath: string;
  nodeId: string;
}

export interface ParseResponse {
  type: "parsed";
  id: number;
  nodeId: string;
  fsPath: string;
  nodes: unknown[];
  wikilinks: unknown[];
  error?: string;
}

export type WorkerMessage = ParseRequest | { type: "shutdown" };
export type WorkerResponse =
  | ParseResponse
  | { type: "ready" }
  | { type: "shutdown" };

// Worker entry point
declare const self: Worker;

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const message = event.data;

  if (message.type === "shutdown") {
    self.postMessage({ type: "shutdown" } satisfies WorkerResponse);
    return;
  }

  if (message.type === "parse") {
    try {
      const content = readFileSync(message.fsPath, "utf-8");
      const { nodes, wikilinks } = parseMarkdownWithLinks(
        content,
        message.fsPath,
      );

      self.postMessage({
        type: "parsed",
        id: message.id,
        nodeId: message.nodeId,
        fsPath: message.fsPath,
        nodes,
        wikilinks,
      } satisfies ParseResponse);
    } catch (err) {
      self.postMessage({
        type: "parsed",
        id: message.id,
        nodeId: message.nodeId,
        fsPath: message.fsPath,
        nodes: [],
        wikilinks: [],
        error: err instanceof Error ? err.message : String(err),
      } satisfies ParseResponse);
    }
  }
};

// Signal ready
self.postMessage({ type: "ready" } satisfies WorkerResponse);
