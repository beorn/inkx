/**
 * Enable SILVERY_STRICT before the framework module graph loads.
 *
 * Must be a side-effect IMPORT (not a bare statement in the test file): ESM
 * hoists imports above statements, and parts of the render stack capture
 * strict-mode state during module initialization. Import this FIRST from any
 * test whose assertions are meaningless without strict instrumentation
 * (incremental≡fresh verification, pipeline stat counters).
 */
process.env.SILVERY_STRICT = "1"
