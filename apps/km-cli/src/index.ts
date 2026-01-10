/**
 * km CLI - Knowledge Machine command-line interface
 *
 * Re-exports from src/cli for backwards compatibility
 */

// Re-export the main CLI module
export * from "../../../src/cli/index.ts";

// Run the CLI when executed directly
import "../../../src/cli/index.ts";
