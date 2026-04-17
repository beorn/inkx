// Stub for Node.js builtins not used in browser canvas rendering.
// Vite dev mode doesn't tree-shake barrel re-exports, so modules like
// output-phase.ts and scheduler.ts get loaded even though the canvas path
// never calls them. These stubs satisfy the named imports without crashing.
//
// Uses a Proxy default export so any named import resolves to a no-op function.
const noop = () => {}
const handler = { get: () => noop }
export default new Proxy({}, handler)

// Named exports needed by ag-term modules (node:fs)
export const openSync = noop
export const writeSync = noop
export const closeSync = noop
export const appendFileSync = noop
export const readFileSync = noop
export const existsSync = () => false
export const readdirSync = () => []
export const mkdirSync = noop
export const writeFileSync = noop

// node:os
export const homedir = () => "/tmp"

// node:tty
export const isatty = () => false
