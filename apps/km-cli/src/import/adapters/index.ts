/**
 * Import Adapter Registry
 *
 * Registers all built-in adapters. Import this module to make all adapters available.
 */

import { registerAdapter } from "../adapter.ts"
import { asanaAdapter } from "./asana/asana-adapter.ts"
import { csvAdapter } from "./csv-adapter.ts"

// Register built-in adapters
registerAdapter(asanaAdapter)
registerAdapter(csvAdapter)

export { asanaAdapter } from "./asana/asana-adapter.ts"
export { csvAdapter } from "./csv-adapter.ts"
