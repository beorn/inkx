/**
 * Minimal vitest setup for PTY tests.
 *
 * PTY tests spawn real child processes with terminal PTYs (via Bun.spawn).
 * The standard setup.ts breaks PTY input by setting process.stdout.isTTY=false,
 * which interferes with Bun's PTY write channel. This setup intentionally
 * omits the isTTY override, SILVERY_STRICT, React matchers, and other
 * TUI-specific infrastructure that PTY tests don't need.
 */

// Kill zombie forks: when vitest uses pool:'forks', child_process.fork() workers survive
// if the parent is killed abruptly (SIGKILL). The 'disconnect' event fires when the IPC
// channel closes (parent died), so we exit immediately to prevent orphan processes.
// No-op for pool:'threads' (no IPC channel, no process.connected).
if (typeof process.connected === "boolean") {
  process.on("disconnect", () => {
    process.exit(1)
  })
}

// Suppress logger output during tests
process.env.LOG_LEVEL = "warn"
