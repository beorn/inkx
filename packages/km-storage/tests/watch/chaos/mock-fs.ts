/**
 * MockFileSystem re-export from @beorn/watcher-chaos
 *
 * This file re-exports the MockFileSystem from the vendor package
 * for use in km-storage chaos tests.
 */

export {
  MockFileSystem,
  createMockFileSystem,
  type StatResult,
  type FsEntry,
  type FileSystemOps,
  type DirectoryScanner,
  type ErrorInjection,
} from "@beorn/watcher-chaos";
