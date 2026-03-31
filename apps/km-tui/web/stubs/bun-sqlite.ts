/** Browser stub for bun:sqlite — provides type-compatible no-ops */
export class Database {
  constructor() {
    throw new Error("bun:sqlite is not available in the browser")
  }
  prepare() {
    return { get: () => null, all: () => [], run: () => ({}) }
  }
  exec() {}
  close() {}
}
export default Database
