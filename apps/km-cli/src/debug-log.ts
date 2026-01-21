/**
 * Debug Log File Support
 *
 * Redirects debug output to a file when DEBUG_LOG env var is set.
 * Must be imported before any debug() calls.
 */

import createDebug from "debug";
import { createWriteStream, type WriteStream } from "fs";
import { format } from "util";

let stream: WriteStream | null = null;

const logPath = process.env.DEBUG_LOG;
if (logPath) {
  stream = createWriteStream(logPath, { flags: "a" });

  createDebug.log = (...args: unknown[]) => {
    if (stream) {
      stream.write(format(...args) + "\n");
    }
  };

  // Clean up on exit
  process.on("exit", () => stream?.end());
  process.on("SIGINT", () => {
    stream?.end();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    stream?.end();
    process.exit(0);
  });
}

export { stream as debugLogStream };
