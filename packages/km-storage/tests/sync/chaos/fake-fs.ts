/**
 * FakeFileSystem re-export from @beorn/watcher-chaos
 *
 * This file re-exports the FakeFileSystem from the vendor package
 * for use in km-storage chaos tests.
 */

export {
  FakeFileSystem,
  createFakeFileSystem,
  // Deprecated aliases for backwards compatibility
  type StatResult,
  type FsEntry,
  type FileSystemOps,
  type DirectoryScanner,
  type ErrorInjection,
} from "@beorn/watcher-chaos"
