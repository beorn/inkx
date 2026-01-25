/**
 * Parse Worker Thread
 *
 * Parses markdown files in a worker thread for parallel processing.
 * km-fast-md.6: Worker pool for parallel parsing
 */

import { readFileSync } from "fs";
import { parseMarkdownWithLinks } from "@km/markdown";

const NAMESPACE = "km:storage:parse-worker";

// Custom debug function that forwards to main thread
// Worker threads MUST forward debug output to main thread for proper DEBUG_LOG handling
function debug(message: string, ...args: unknown[]): void {
  // Format the message with args (simple %s/%d/%O replacement)
  let formatted = message;
  let argIndex = 0;
  formatted = message.replace(/%[sdOo]/g, () => {
    const arg = args[argIndex++];
    if (arg === undefined) return "";
    if (arg === null) return "null";
    if (typeof arg === "object") return JSON.stringify(arg);
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    return String(arg);
  });

  // Send to main thread - NEVER call createDebug() in worker
  try {
    postMessage({ type: "debug", namespace: NAMESPACE, message: formatted });
  } catch {
    // Worker might not be fully initialized yet
  }
}

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
  | { type: "shutdown" }
  | { type: "debug"; namespace: string; message: string };

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
      debug("parsing %s", message.fsPath);
      const content = readFileSync(message.fsPath, "utf-8");
      const { nodes, wikilinks } = parseMarkdownWithLinks(
        content,
        message.fsPath,
      );

      debug("parsed %s: %d nodes, %d links", message.fsPath, nodes.length, wikilinks.length);
      self.postMessage({
        type: "parsed",
        id: message.id,
        nodeId: message.nodeId,
        fsPath: message.fsPath,
        nodes,
        wikilinks,
      } satisfies ParseResponse);
    } catch (err) {
      debug("parse error %s: %s", message.fsPath, err instanceof Error ? err.message : String(err));
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
